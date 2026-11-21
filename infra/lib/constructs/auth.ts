import { Duration, type RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  AccountRecovery,
  FeaturePlan,
  Mfa,
  UserPool,
  type UserPoolClient,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthProps {
  stage: string;
  removalPolicy: RemovalPolicy;
  deletionProtection: boolean;
}

/**
 * Operators sign in with email and password against a Cognito user pool. There
 * is no self sign-up: an administrator creates accounts (see docs/deployment.md).
 * The web app calls InitiateAuth (USER_PASSWORD_AUTH) directly, so the client
 * has no secret, and sends the ID token to both APIs.
 */
export class Auth extends Construct {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  /** Origin the browser calls for InitiateAuth (allowed in the CSP). */
  readonly cognitoEndpoint: string;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `provisioning-portal-${props.stage}`,
      featurePlan: FeaturePlan.LITE,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      // The portal has no MFA or recovery screens yet; an administrator resets passwords.
      mfa: Mfa.OFF,
      accountRecovery: AccountRecovery.NONE,
      deletionProtection: props.deletionProtection,
      removalPolicy: props.removalPolicy,
    });

    this.client = this.userPool.addClient('WebClient', {
      userPoolClientName: 'web',
      generateSecret: false,
      authFlows: { userPassword: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      // Matches the local harness: an operator signs in once per working day.
      idTokenValidity: Duration.hours(8),
      accessTokenValidity: Duration.hours(8),
      refreshTokenValidity: Duration.days(1),
    });

    this.cognitoEndpoint = `https://cognito-idp.${Stack.of(this).region}.amazonaws.com`;
  }
}
