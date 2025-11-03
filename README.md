# What is this?

A repo to easy deploy a pipeline and more infrastructure using AWS CDK and IaC approach. With this
repo you can deploy diffetent pipelines for different environments (for example, dev, integration,
production) responding to changes in different branches for your gitHub repository.

## 🔐 Autenticación JWT

Este proyecto incluye un sistema de autenticación JWT para proteger la API de testing. Las lambdas de autenticación están en `lambdas/auth/`.

### Configuración del Secreto (Solo Primera Vez)

El secreto JWT se guarda en AWS Secrets Manager en el secreto `Secret-pipeline`, junto con el token de GitHub.

```bash
# 1. Navegar a la carpeta del pipeline
cd pipeline

# 2. Copiar .env.example si no existe .env
cp .env.example .env

# 3. Generar un secreto JWT seguro
openssl rand -base64 64 | tr -d '\n'

# 4. Editar .env y configurar:
#    - GITHUB_TOKEN (tu PAT de GitHub)
#    - JWT_SECRET (el secreto generado arriba)
nano .env

# 5. Deploy del secreto con CDK (solo primera vez o cuando cambies secretos)
npm install
npx cdk deploy SecretPipelineStack
```

### Validación Local (Antes de Push)

```bash
# Desde la raíz del proyecto
./validate-stack.sh
```

### 🚀 Deploy Automático

El pipeline se encarga del deploy automáticamente cuando haces push a la rama configurada. No necesitas hacer `cdk deploy` manualmente para la infraestructura.

### 🔒 Seguridad

- El secreto JWT se configura en `pipeline/.env` (archivo local, **no se commitea**)
- Se deploya manualmente con `cdk deploy SecretPipelineStack` (solo una vez)
- Secrets Manager contiene: `{"gitHubToken": "...", "jwtSecret": "..."}`
- Las lambdas leen `jwtSecret` desde Secrets Manager en runtime

⚠️ **IMPORTANTE**: El archivo `pipeline/.env` está en `.gitignore`. Nunca lo commitees al repositorio público.

# Getting started

### We need...

- A gitHub account and clone this repo
  - A PAT token with the following permissions:
    - repo
    - admin:repo_hook
    - workflow
- One or more AWS accounts
  - Users with AdministratorAccess policy
  - AWS CLI installed

### Create a AWS user with AdministratorAccess policy

- Go to your AWS account using the root user
- Go to "My Security Credentials" and create an Access Key and a Secret Access Key
- Execute `aws configure` and set your Access Key and Secret Access Key, a default region and a
  default output format, for example `json`
- In this point you should to have a profile in your `~/.aws/credentials` file
- Check your profile with `aws sts get-caller-identity --profile <profile-name>`
  - When you see :root in the ARN, you are using the root user
  - When you see :user in the ARN, you are using an IAM user
- We want to use an IAM user, so we need to create a new user with AdministratorAccess policy
- Use the command `aws iam create-user --user-name newUser`
- It's a good practice to create a group and assign the AdministratorAccess policy to the group
- Use the command `aws iam create-group --group-name administrators`
- Then assign the policy to the group with
  `aws iam attach-group-policy --group-name administrators --policy-arn arn:aws:iam::aws:policy/AdministratorAccess`
- Finally, add the user to the group with
  `aws iam add-user-to-group --user-name newUser --group-name`
- Now we need credentials for this user, use: `aws iam create-access-key --user-name newUser`
- Keep this credentials in a safe place, we need them later to create a new profile
- Generate a password for this user to use AWS web console
  `aws iam create-login-profile --user-name newUser --password securePass --password-reset-required`
  - Your can get the URL to login with this user navigating in your AWS account on the user profile
    and usually is something like `https://<account_ID>.signin.aws.amazon.com/console`
- Now we need to create a new profile in our `~/.aws/credentials` file using again
  `aws configure --profile newUser`
- Keep in mind that this repo is thought to be used with multiple profiles and each profile could be
  a different environment.

### Create your PAT token in gitHub

- Go to your gitHub account
- Create a PAT token with the following permissions:
  - repo
  - admin:repo_hook
  - workflow
- Use this guideline
  https://docs.github.com/es/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
  to create your token, remember use classic version
- Copy this token and rename the file envExample to .env and paste the token in the GITHUB_TOKEN
  variable
  - Make sure to add this file to your .gitignore and remove it when your pipeline is created

### Configure your cdk.json files and buildspec.yml

- Go to infa/cdk.json and pipeline/cdk.json and use your own names for your environments and project
  name, and also the repo/branch you want to use to listen for changes in your pipeline
- You can see different buildspec.yml files in the infra folder, each environment we will point to a
  different file using the prefix of the environment. Each file has little changes to compose names
  of the resources using the context variables in the cdk.json file, for example a "pro" pipeline
  will use the pro-buildspec.yml file and this buildspec file will use the "pro" context variable to
  compose the name of the resources. It will do using the --context flag in the cdk synth and cdk
  deploy commands. So, if you use different context variables in the cdk.json file, you will need to
  create different buildspec files to use the context variables in the names of the resources.

### Deploy the pipeline for the first time

Launch the cdk commands for deploy the pipeline first time for each environment and aws account:

- cd pipeline
- npm i
- npx cdk bootstrap --context env=<your-environment> --all --profile <your-pre-profile-of-AWS>
- npx cdk synth --context env=<your-environment> --all --profile <your-pre-profile-of-AWS>
- npx cdk deploy --context env=<your-environment> --all --profile <your-pre-profile-of-AWS>

  - For example `npx cdk deploy --context env=pre --all --profile <pre-profile-aws>` will deploy a
    pipeline in the pre account aws using the pre context variables in the cdk.json file and it will
    use the pre pre-buildspec.yml file to build the resources.

### Validate connection to github

- Go to your AWS account
- Go to CodePipeline and select your new pipeline
- Go to edit/source/edit source
- Click to connect to github and connect to your repository
- Select the repo and branch you want to use
- OK and save
- Accept the webhook creation
- Go to your gitHUB repository and check the webhook created
- Go to AWS CodePipeline and click to release the pipeline

### First deploy!

When the pipeline is released, it will start the first deploy of the infraestructure. You can see
the the constructs of AWS in the app of /infra are created in your AWS account.

### Using the automatic pipeline

- Push a new commit to the repository in the branch you selected to listen the changes and the
  pipeline will start automatically.

## Destroy your infrastructure

- cdk destroy --all --profile <profile-name> --context env=<your-environment>
  - use --all carefully
