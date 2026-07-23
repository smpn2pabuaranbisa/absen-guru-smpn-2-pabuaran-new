import * as babel from '@babel/core';

const code = `
const obj = { icon: LogIn };
const el = <obj.icon className="w-5" />;
`;

const output = babel.transformSync(code, {
  presets: ['@babel/preset-react']
});
console.log(output.code);
