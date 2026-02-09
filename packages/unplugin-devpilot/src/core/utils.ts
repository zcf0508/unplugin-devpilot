import { exec } from 'node:child_process';

/**
 * npx free-port :port
 */
export async function killPort(port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    exec(`npx -y @maxbo/free-port ${port} -s`, (err, stdout, _stderr) => {
      if (err) {
        reject(err);
      }
      else {
        console.log(stdout);
        resolve();
      }
    });
  });
}
