import {Command} from 'commander';
import {NodeSSH} from "node-ssh"

/**
 * @typedef {{
 *   host: string,
 *   password: string,
 *   token: string,
 *   subDomain: string,
 *   username: string,
 *   port: number,
 *   config?: string,
 * }} parameters
 */

const program = new Command();
const ssh = new NodeSSH();
const log = new Logger('SSH');

program
  .name('deploy-script')
  .description('Server deployment utilities')
  .version('0.0.1');

program
  .option('-d, --debug <string>', 'Debug mode')
  .option('-s, --host <string>', 'Server address (host) or IP')
  .option('-p, --password <string>', 'Server SSH password')
  .option('-g, --token <string>', 'GitHub PAT token')
  .option('-c, --config <string>', 'Apache2 configuration file to override')
  .option('-n, --sub-domain <string>', 'New subdomain to create. e.g. sub.example.com')
  .option('-P, --port <number>', 'Server SSH port', '22')
  .option('-u, --username <string>', 'Server SSH username', 'root')
  .action(
    /**
     * @param {parameters} parameters
     */
    (parameters) => {
      parameters.port = +parameters.port;
      log.debug(parameters);
      sshConnect(() => null, parameters).catch(log.error);
    });

program.parse();

/**
 * @param {Function} callback
 * @param {parameters} parameters
 */
async function sshConnect(callback, {host, port, username, password}) {
  return ssh.connect({
    username,
    password,
    host,
    port
  }).then(() => {
    return ssh.execCommand(`
      cd /var/www &&
      ls -la
    `).then(data => {
      console.log(data);
    })
  });
}

function Logger(msg) {
  return {
    error: (...args) => console.error(`[${msg}][ERROR]`, ...args),
    warn: (...args) => console.error(`[${msg}][WARN]`, ...args),
    log: (...args) => console.error(`[${msg}][LOG]`, ...args),
    debug: (...args) => console.error(`[${msg}][DEBUG]`, ...args),
    info: (...args) => console.error(`[${msg}][INFO]`, ...args),
  }
}
