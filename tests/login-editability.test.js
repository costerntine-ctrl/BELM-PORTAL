const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const html = read("frontend/customer-app.html");
const js = read("frontend/customer-app.js");
const css = read("frontend/customer-app.css");
const sw = read("frontend/belm-sw.js");
const apache = read("docker/belm-apache.conf");

assert.match(html, /<label for="email">Email \/ Customer Portal ID<\/label>/, "email label must focus its input");
assert.match(html, /<label for="password">Password<\/label>/, "password label must focus its input");
assert.doesNotMatch(html, /id="(?:email|password)"[^>]*(?:readonly|disabled)/, "credential inputs must be natively editable");
assert.match(html, /class="belm-secret-field"><input id="password"[\s\S]*id="loginPasswordToggle"/, "password input and toggle must start in stable parsed markup");
assert.doesNotMatch(html, /<script[^>]+password-visibility\.js/, "login must not run the global password enhancer that rewrites the input DOM");

assert.doesNotMatch(js, /cloneNode|replaceWith/, "login runtime must never replace a Chrome Password Manager input target");
assert.match(js, /'pointerdown','mousedown','touchstart','focus','keydown','beforeinput','animationstart'/, "native inputs must be unlocked for mouse, keyboard and autofill events");
assert.match(js, /getRegistrations\(\)[\s\S]*unregister\(\)/, "login must retire old service workers after loading the network-only build");
assert.match(js, /form\.addEventListener\('submit'[\s\S]*requestLoginConfirmation\(\)/, "two-step login confirmation must remain in place");
assert.match(js, /confirmLoginButton\?\.addEventListener\('click',login\)/, "credentials must only be submitted from Confirm Login");

assert.match(css, /#loginForm input\{[^}]*pointer-events:auto!important[^}]*user-select:text!important/, "CSS must leave credential inputs as direct edit targets");
const shell = sw.match(/const SHELL=\[([\s\S]*?)\];/)?.[1] || "";
assert.doesNotMatch(shell, /customer-app\.|password-visibility\./, "service worker must not precache the login shell or assets");
assert.match(sw, /if\(isLoginShell\)[\s\S]*fetch\(event\.request,\{cache:'no-store'\}\)/, "login navigation must always use the network");
assert.match(apache, /customer-app\\\.\(html\|css\|js\)[\s\S]*Cache-Control "no-store/, "server must prevent login asset caching");

console.log("Login editability contract passed.");
