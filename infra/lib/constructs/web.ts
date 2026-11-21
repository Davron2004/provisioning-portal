import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Duration, Lazy, RemovalPolicy } from 'aws-cdk-lib';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { LogGroup, type RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, CacheControl, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import type { RuntimeConfig } from '@provisioning/contracts';
import { contentSecurityPolicy, inlineScriptHashes } from '../csp';

export interface WebProps {
  /** Angular build output (the folder holding index.html). */
  buildDir: string;
  removalPolicy: RemovalPolicy;
  logRetention: RetentionDays;
}

/** Files with stable names: revalidated on every load. Everything else is content-hashed. */
const UNHASHED = ['index.html', 'config.json', 'theme-init.js', 'favicon.svg'];

/**
 * The Angular app: a private S3 bucket behind CloudFront (Origin Access
 * Control), SPA routing (403/404 serve index.html), security headers with a
 * CSP derived from the build, and a generated config.json.
 */
export class Web extends Construct {
  readonly distribution: Distribution;
  readonly bucket: Bucket;
  /** https://<id>.cloudfront.net */
  readonly url: string;
  private readonly buildDir: string;
  private readonly deployLogs: LogGroup;
  private connectSources: string[] | undefined;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);
    this.buildDir = props.buildDir;
    this.deployLogs = new LogGroup(this, 'DeployLogs', {
      retention: props.logRetention,
      removalPolicy: props.removalPolicy,
    });
    const indexHtml = join(props.buildDir, 'index.html');
    if (!existsSync(indexHtml)) {
      throw new Error(
        `Web build not found at ${props.buildDir}. Run "npm run build -w @provisioning/web" first.`,
      );
    }
    const scriptHashes = inlineScriptHashes(readFileSync(indexHtml, 'utf8'));

    const destroy = props.removalPolicy === RemovalPolicy.DESTROY;
    this.bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: destroy,
    });

    const headers = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: 'Provisioning portal security headers',
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365 * 2),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: Lazy.string({
            produce: () =>
              contentSecurityPolicy({ scriptHashes, connect: this.connectSources ?? [] }),
          }),
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
            override: true,
          },
        ],
      },
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: 'Provisioning portal web app',
      defaultRootObject: 'index.html',
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        compress: true,
      },
      // Deep links (/accounts/acc_1) are client-side routes. Without ListBucket,
      // S3 answers a missing key with 403, so both map to the app shell.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    });
    this.url = `https://${this.distribution.distributionDomainName}`;

    this.node.addValidation({
      validate: () =>
        this.connectSources ? [] : ['Web.deploy() was not called: no app or config.json'],
    });
  }

  /**
   * Uploads the build plus a generated config.json, and allows the app's API
   * origins in the CSP. Hashed bundles are cached for a year; index.html,
   * config.json and the other unhashed files are revalidated on every load.
   */
  deploy(config: RuntimeConfig, connectSources: string[]): void {
    this.connectSources = connectSources;
    // Both deployments share one handler Lambda, so they share its settings.
    const handler = { memoryLimit: 512, logGroup: this.deployLogs };

    // Old hashed chunks are kept (no prune): a tab still running the previous
    // version can lazy-load its routes after a deploy.
    const assets = new BucketDeployment(this, 'DeployAssets', {
      sources: [Source.asset(this.buildDir, { exclude: UNHASHED })],
      destinationBucket: this.bucket,
      prune: false,
      cacheControl: [
        CacheControl.setPublic(),
        CacheControl.maxAge(Duration.days(365)),
        CacheControl.immutable(),
      ],
      ...handler,
    });

    const shell = new BucketDeployment(this, 'DeployShell', {
      sources: [
        // The build's own config.json points at the local harness; it is replaced here.
        Source.asset(this.buildDir, {
          exclude: ['*', ...UNHASHED.map((f) => `!${f}`), 'config.json'],
        }),
        Source.jsonData('config.json', config),
      ],
      destinationBucket: this.bucket,
      prune: false,
      cacheControl: [CacheControl.noCache()],
      distribution: this.distribution,
      distributionPaths: UNHASHED.map((f) => `/${f}`).concat('/'),
      ...handler,
    });
    // The new index.html must not go live before the bundles it references.
    shell.node.addDependency(assets);
  }
}
