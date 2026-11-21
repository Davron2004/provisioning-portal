# Deploying to AWS

The CDK app in `infra/` deploys the whole portal as one stack,
`ProvisioningPortal-dev`, in `ca-central-1`. After a one-time setup, every
push to `main` that passes CI is deployed by GitHub Actions
(`.github/workflows/deploy.yml`), which signs in to AWS with OIDC. No AWS
keys are stored in GitHub. Until the setup is done, the deploy job is skipped
and `main` stays green.

What the stack contains and why is in `docs/detailed-design.md`
("Infrastructure").

## One-time setup

You need an AWS account, Node.js 22, the AWS CLI v2 and the GitHub CLI.

### 1. Admin credentials on your machine

Only you use these, for the bootstrap and the OIDC stack below. GitHub never
gets them.

Recommended: IAM Identity Center. In the console, enable IAM Identity Center,
create a user for yourself, and assign it to the account with the
`AdministratorAccess` permission set. Then:

```bash
aws configure sso          # profile name: portal-admin, region: ca-central-1
aws sso login --profile portal-admin
export AWS_PROFILE=portal-admin
aws sts get-caller-identity   # shows your account id
```

(An IAM user with an access key works too: `aws configure`. Delete the key
when you are done with these steps.)

### 2. Bootstrap CDK

From the repository root:

```bash
npm ci
npm run build -w @provisioning/web     # synth needs the web build
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
npm run cdk -w @provisioning/infra -- bootstrap "aws://$ACCOUNT/ca-central-1"
```

This creates the `CDKToolkit` stack: an assets bucket and the `cdk-hnb659fds-*`
roles that do the actual deploying.

### 3. Deploy the GitHub OIDC stack (once)

```bash
npm run cdk -w @provisioning/infra -- deploy ProvisioningPortal-GithubOidc
```

It creates the IAM OIDC provider for `token.actions.githubusercontent.com` and
the role `provisioning-portal-github-deploy`. The role trusts only jobs of
`Davron2004/provisioning-portal` that run in the `aws-dev` GitHub environment,
and may only assume the CDK bootstrap roles above. Copy the `DeployRoleArn`
output.

If the account already has a GitHub OIDC provider (the deploy fails with
"already exists"), reuse it:

```bash
npm run cdk -w @provisioning/infra -- deploy ProvisioningPortal-GithubOidc \
  -c githubOidcProviderArn="arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
```

### 4. Configure the repository

```bash
gh variable set AWS_DEPLOY_ROLE_ARN --body "arn:aws:iam::<account>:role/provisioning-portal-github-deploy"
gh variable set AWS_REGION --body ca-central-1
gh secret set BUDGET_EMAIL            # paste the address for budget and alarm emails
```

The `aws-dev` environment already exists and only accepts deployments from
`main` (Settings > Environments). If it is ever deleted, recreate it with a
deployment branch rule for `main`: the role's trust policy is tied to the
environment name, and the branch rule is what limits it to `main`.

Optional variables: `ASSISTANT_PROVIDER` (`bedrock` by default; `rules` runs
the assistant without a model, `anthropic` uses the Claude API), and
`BEDROCK_REGION` if Claude is not offered on Bedrock in `ca-central-1`.

### 5. Enable the model on Bedrock

Bedrock console, region `ca-central-1` (or your `BEDROCK_REGION`) > Model
access: enable Anthropic Claude Opus 5.5. The first Anthropic model in an
account asks for a short use-case form. Until access is granted the assistant
answers with "assistant unavailable" and everything else works.

To use the Claude API instead: store the key as a SecureString and set the
provider.

```bash
aws ssm put-parameter --type SecureString \
  --name /provisioning-portal/dev/anthropic-api-key --value "<key>"
gh variable set ASSISTANT_PROVIDER --body anthropic
```

### 6. Deploy

Push to `main`, or run the workflow by hand:

```bash
gh workflow run deploy.yml
gh run watch
```

The first deploy takes about 25 minutes, mostly the OpenSearch domain. On
stack creation the demo dataset (fictional accounts, users, numbers and
orders) is written to the table and indexed for search. The job ends with a
smoke test: the web app loads, deep links fall back to it, `config.json`
points at this stack, and the API answers `401` with the JSON error body
without a token. The web URL is on the run's `aws-dev` environment link and in
the stack outputs.

### 7. Create your sign-in

There is no sign-up page. Create the operator yourself (the password needs 12+
characters with upper and lower case, a digit and a symbol; it is never
stored in the repository):

```bash
POOL=$(aws cloudformation describe-stacks --stack-name ProvisioningPortal-dev \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
read -rs -p "Password: " PASSWORD; echo
aws cognito-idp admin-create-user --user-pool-id "$POOL" --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
    Name=name,Value="Demo Admin" \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username admin@example.com \
  --password "$PASSWORD" --permanent
```

Use a real address instead of `admin@example.com` if you want, it is only the
sign-in name.

## Deploying from your machine

With admin credentials (step 1), the same as CI:

```bash
npm run build -w @provisioning/web
npm run cdk -w @provisioning/infra -- deploy ProvisioningPortal-dev \
  -c budgetEmail=you@example.com --outputs-file cdk-outputs.json
infra/scripts/smoke-test.sh infra/cdk-outputs.json ProvisioningPortal-dev
```

Context options: `stage` (default `dev`; `prod` retains data), `region`,
`budgetEmail`, `monthlyBudgetUsd` (50), `assistantProvider`, `assistantModel`,
`bedrockRegion`, `anthropicApiKeyParam`, `apiRateLimit` (10), `apiBurstLimit`
(20), `seedDemoData` (on except in `prod`).

## Cost

Rough monthly cost in `ca-central-1` for a demo with light use:

| Item                                                     | Per month                        |
| -------------------------------------------------------- | -------------------------------- |
| OpenSearch, one `t3.small.search` (about $0.04 per hour) | about $28-30                     |
| OpenSearch storage, 10 GiB gp3                           | about $1.50                      |
| CloudWatch alarms (14 x $0.10)                           | $1.40                            |
| Lambda, API Gateway, DynamoDB, Step Functions, S3, SQS   | cents (pay per use)              |
| CloudFront                                               | cents                            |
| Cognito (Lite, under 10,000 monthly users)               | free                             |
| Bedrock / Claude API                                     | per token, per assistant request |
| **Total**                                                | **about $32-35 + model use**     |

OpenSearch is the only resource billed by the hour, so it is almost the whole
bill. Accounts still on the original 12-month free tier get 750 hours of
`t3.small.search` a month, which covers it; newer accounts get free-tier
credits instead. The $50 budget emails you at $40 actual and when the forecast
passes $50. Check the AWS pricing pages before relying on these figures.

## Teardown

```bash
npm run cdk -w @provisioning/infra -- destroy ProvisioningPortal-dev
```

In `dev` everything is deleted: table, user pool, search domain, web bucket
and its objects, logs. With `stage=prod` the table, user pool, search domain
and web bucket are retained (and the stack has termination protection), so
delete them by hand if you mean to.

Separately, if you want nothing left at all:

```bash
npm run cdk -w @provisioning/infra -- destroy ProvisioningPortal-GithubOidc
gh variable delete AWS_DEPLOY_ROLE_ARN   # deploys go back to being skipped
```

The `CDKToolkit` stack (step 2) costs nothing while idle; delete it from the
CloudFormation console, then empty and delete its assets bucket.

## Not verified without an AWS account

This was built and tested without AWS credentials: `cdk synth`, template
tests and handler bundles pass, but nothing has been deployed yet. Things to
check on the first deploy:

- Bedrock: the `bedrock-mantle:CreateInference` grant on the account's
  projects, the model id `anthropic.claude-opus-5-5`, and model availability
  in `ca-central-1`.
- The REST authorizer accepting the app's `Authorization: Bearer <token>`
  header.
