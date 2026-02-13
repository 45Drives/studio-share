const { execFile } = require("child_process");
const { promisify } = require("util");
const { join } = require("path");
const run = promisify(execFile);

exports.default = async function (context) {
  if (process.env.SKIP_AFTER_SIGN === "1") return;

  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  await run("codesign", ["-vvv", "--deep", "--strict", "--verify", app]);
};
