import * as esbuild from 'esbuild';

const code = `
const el = <modalState.type.icon className="w-5" />;
`;

async function run() {
  const output = await esbuild.transform(code, { loader: 'jsx' });
  console.log(output.code);
}
run();
