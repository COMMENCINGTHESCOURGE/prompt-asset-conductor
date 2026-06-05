import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';

const program = new Command();
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

program
  .name('prompt-asset')
  .description('Orchestrate writer, drawer, sound nodes')
  .version('0.1.0');

program
  .command('run <pipeline>')
  .description('Run a named pipeline (writer->drawer->sound)')
  .option('--input <path>', 'Input data file')
  .option('--out <dir>', 'Output directory', './dist')
  .action((pipeline, opts) => {
    const nodes = ['prompt-asset-writer', 'prompt-asset-drawer', 'prompt-asset-sound'];
    const procs = nodes.map(n => {
      const p = spawn(n, ['generate', '--pipeline', pipeline], {
        cwd: PROJECT_ROOT,
        stdio: ['pipe', 'inherit', 'inherit']
      });
      return new Promise<void>((resolve, reject) => {
        p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${n} exited ${code}`)));
      });
    });
    Promise.all(procs).then(() => console.log('Pipeline complete')).catch(e => { console.error(e); process.exit(1); });
  });

program.parse();
