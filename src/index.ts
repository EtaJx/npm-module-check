#!/usr/bin/env node
const util = require('util');
const fs = require('fs/promises');
const { exec, spawn } = require('child_process');
const chalk = require('chalk');

const args = process.argv.slice(2);
const log = console.log;

type PackageInfo = {
  [key: string]: string
}

const helpContent = () => {
  log(
    chalk.green(`usage:
    modules-check <package.json>
    `)
  );
}

const warningContent = (warningMessage: string) => {
  log(
    chalk.yellow(`WARNING:
    ${warningMessage}
    `)
  );
}

const normalContent = (message: string) => {
  log(
    chalk.whiteBright(`${message}`)
  );
}

const promisify = (promisifyFun: Function) => util.promisify(promisifyFun);

const exitCommand = (code?: number) => {
  process.exit(code ?? 0);
}

// analyseCommandLineArguments
const getPackageJsonFile = (): string => {
  if (args.length === 0) {
    helpContent();
    exitCommand();
  }
  const [packageFile] = args
  return packageFile;
}

const readPackageJsonFile = async () => {
  const packageJson = getPackageJsonFile();
  if (!packageJson) {
    throw new Error('Please specify a package.json');
  }
  const packageJsonBuffer = await fs.readFile(packageJson, {
    encoding: 'utf-8'
  });
  return JSON.parse(packageJsonBuffer.toString());
}

const getDependencies = async (): Promise<unknown> => {
  const { devDependencies, dependencies } = await readPackageJsonFile();
  return {
    devDependencies,
    dependencies
  };
}

const checkPackageVersion = async (packageInfo: PackageInfo): Promise<PackageInfo> => {
  const { packageName, version } = packageInfo;
  const { stdout } = await promisify(exec)(`npm info ${packageName} version`);
  return {
    name: packageName,
    version,
    latestVersion: `^${stdout.replace(/\n/g, '')}`
  }
}

const printPackageInfos = (packageInfo: PackageInfo) => {
  const { name, version, latestVersion } = packageInfo;
  log(`${chalk.yellow(name)}${chalk.green(`@${version}`)} -> ${chalk.yellow(name)}${chalk.red(`@${latestVersion}`)}`);
}

const backupPackageJson = async () => {
  const oldPackageJson = getPackageJsonFile();
  await exec(`cp ${oldPackageJson} ${oldPackageJson}.backup`);
}

const createPackageJson = async (packageJsonData: PackageInfo) => {
  const packageJsonFile = getPackageJsonFile();
  await fs.writeFile(packageJsonFile, JSON.stringify(packageJsonData, null, 2), { encoding: 'utf-8' });
}

const handlePackageJson = async (packageInfos: PackageInfo[]) => {
  const devDependencies: PackageInfo = {};
  const dependencies: PackageInfo = {};
  packageInfos.forEach(({ name, latestVersion, type }) => {
    (type === 'dev' ? devDependencies : dependencies)[name] = latestVersion;
  });
  const packageJson = await readPackageJsonFile();
  normalContent('Backup package.json');
  await backupPackageJson();
  const newPackageJson = {
    ...packageJson,
    dependencies,
    devDependencies
  }
  normalContent('Create new package.json');
  await createPackageJson(newPackageJson);
}

const showPackageVersions = async (packages: PackageInfo, type: string): Promise<PackageInfo[]> => {
  const packageArr = Object.entries(packages);
  const packageVersionInfos: PackageInfo[] = [];
  log(`${type === 'dev' ? 'devDependencies: ' : 'dependencies: '}`);
  for(const packageInfo of packageArr) {
    const [packageName, version] = packageInfo;
    const packageVersionInfo = await checkPackageVersion({
      packageName,
      version
    });
    packageVersionInfos.push({
      ...packageVersionInfo,
      type
    });
    printPackageInfos(packageVersionInfo);
  }
  log('\n');
  return packageVersionInfos;
}

const executeInstallDependencies = async () => {
  normalContent('clear old node_modules');
  await exec('rm -rf node_modules');
  normalContent('installing latest version dependencies');
  spawn('npm', ['install'], {
    stdio: 'inherit'
  });
}

const executeCommand = async () => {
  const { devDependencies, dependencies } = await getDependencies() as {[key: string]: PackageInfo};
  normalContent('Checking latest version...');
  const newDevDependencies = await showPackageVersions(dependencies, 'dependency');
  const newDependencies = await showPackageVersions(devDependencies, 'dev')
  await handlePackageJson([...newDependencies, ...newDevDependencies]);
  await executeInstallDependencies();
}

executeCommand();
