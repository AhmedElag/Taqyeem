import { readConfig, configErrors } from './config-utils.mjs';
const problems = configErrors(await readConfig());
if (problems.length) {
  console.error('Production configuration is incomplete:\n' + problems.map(item => '  • ' + item).join('\n'));
  console.error('\nRun npm run configure, then upload the three secrets described in docs/DEPLOYMENT.md.');
  process.exitCode = 1;
} else console.log('Production configuration is valid. Secret values and actual email delivery must be verified in the deployment account.');
