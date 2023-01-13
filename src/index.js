import { Command } from 'commander';
import { NodeSSH } from 'node-ssh';
import { join } from 'path';
import { readFileSync } from 'fs';

/**
 * @typedef {{
 *   dockerPort: string,
 *   sshHost: string,
 *   sshPassword: string,
 *   sshUsername: string,
 *   sshPort: number,
 *   serverAdmin: string,
 *   serverDomain: string,
 *   githubToken: string,
 *   githubUsername: string,
 *   githubRepository: string,
 * }} parameters
 */

const program = new Command();
const ssh = new NodeSSH();
const log = new Logger('SSH');

program.name('deploy-script').description('Server deployment utilities').version('0.0.1');
program
  .argument('<string>', 'SSH host')
  .option('-c, --docker-port <string>', 'Docker port to proxy')
  .option('-p, --ssh-password <string>', 'Server SSH password')
  .option('-u, --ssh-username <string>', 'Server SSH username', 'root')
  .option('-e, --server-admin <string>', 'Server admin email address')
  .option('-d, --server-domain <string>', 'New domain/subdomain to create. e.g. sub.example.com')
  .option('-T, --github-token <string>', 'GitHub PAT token')
  .option('-U, --github-username <string>', 'GitHub username')
  .option('-R, --github-repository <string>', 'GitHub repository name. e.g. my-repo')
  .action(
    /**
     * @param {string} host
     * @param {parameters} parameters
     * */
    (host, parameters) => {
      parameters.sshHost = host;
      parameters.sshPort = 22;
      log.debug(parameters);
      sshConnect(parameters)
        .then((ssh) => {
          ssh.dispose();
          log.info('SSH connection closed gratefully!');
          process.exit(0);
        })
        .catch(log.error)
        .then(() => process.exit(1));
    },
  );

program.parse();

/**
 * @param {parameters} parameters
 */
async function sshConnect(parameters) {
  await ssh.connect({
    username: parameters.sshUsername,
    password: parameters.sshPassword,
    host: parameters.sshHost,
    port: parameters.sshPort,
  });
  await createHttpConfig(ssh, parameters.serverAdmin, parameters.serverDomain, parameters.dockerPort);
  await enableSiteConfiguration(ssh, parameters.serverDomain);
  await githubFetchFilesAndConfigureProject(
    ssh,
    parameters.serverDomain,
    parameters.githubToken,
    parameters.githubUsername,
    parameters.githubRepository,
  );

  return ssh;
}

/**
 * @param {NodeSSH} ssh
 * @param {string} serverAdmin
 * @param {string} serverName
 * @param {string} serverPort
 */
async function createHttpConfig(ssh, serverAdmin, serverName, serverPort) {
  const httpConf = readFileSync(join(process.cwd(), './vhosts/http.conf')).toString('utf-8');
  const httpsConf = readFileSync(join(process.cwd(), './vhosts/https.conf')).toString('utf-8');
  const httpFile = httpConf.replace(/__SERVER_ADMIN__/g, serverAdmin).replace(/__SERVER_NAME__/g, serverName);
  const httpsFile = httpsConf
    .replace(/__SERVER_ADMIN__/g, serverAdmin)
    .replace(/__SERVER_NAME__/g, serverName)
    .replace(/__PORT__/g, serverPort);
  await ssh
    .execCommand('cat << EOF > /etc/apache2/sites-available/' + serverName + '.conf\n' + httpFile + '\nEOF')
    .then(processResponse('HTTP configuration created'))
    .catch(report('Create HTTP config'));
  await ssh
    .execCommand('cat << EOF > /etc/apache2/sites-available/' + serverName + '-ssl.conf\n' + httpsFile + '\nEOF')
    .then(processResponse('HTTPS configuration created'))
    .catch(report('Create HTTPS config'));
}

/**
 * @param {NodeSSH} ssh
 * @param {string} serverName
 */
async function enableSiteConfiguration(ssh, serverName) {
  const commands = [
    `cd /etc/apache2/sites-available/`,
    `a2ensite ${serverName}.conf`,
    // `a2ensite ${serverName}-ssl.conf`, // off by default
    'service apache2 restart',
    'echo Apache restarted',
  ].join('\n');
  await ssh
    .execCommand(commands)
    .then(processResponse('Site configuration enabled'))
    .catch(report('Enable site config'));
}

/**
 * @param {NodeSSH} ssh - NODE SSH instance
 * @param {string} server - Server name
 * @param {string} token - GitHub PAT token
 * @param {string} username - GitHub username
 * @param {string} repository - GitHub repository name
 */
async function githubFetchFilesAndConfigureProject(ssh, server, token, username, repository) {
  const commands = [
    `git clone https://${username}:${token}@github.com/${username}/${repository}.git /var/www/${server}`,
    `cd /var/www/${server}`,
    `ls -la`,
  ].join('\n');
  await ssh.execCommand(commands).then(processResponse('Files fetched')).catch(report('Git clone'));
}

function Logger(msg) {
  return {
    error: (...args) => console.error(`[${msg}][ERROR]`, ...args),
    warn: (...args) => console.error(`[${msg}][WARN]`, ...args),
    log: (...args) => console.error(`[${msg}][LOG]`, ...args),
    debug: (...args) => console.error(`[${msg}][DEBUG]`, ...args),
    info: (...args) => console.error(`[${msg}][INFO]`, ...args),
  };
}

/**
 * @param {string} description
 */
function processResponse(description) {
  /**
   * @param {{
   *   stdout: string,
   *   stderr: string,
   *   code: number,
   *   signal: string,
   * }} options
   */
  return (options) => {
    const { code, signal } = options;
    if (code > 0) return log.error(description, options);
    log.info(description, options.stdout, options.stderr, { code, signal });
  };
}

function report(name) {
  return () => {
    throw new Error(name);
  };
}
