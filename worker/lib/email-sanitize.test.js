// Coverage for the dependency-free allowlist sanitiser used on admin-authored
// broadcast HTML. Zero-dependency: run with `node --test` or
// `node --test worker/lib/email-sanitize.test.js`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitiseEmailHtml } from "./email.js";

test("allowed tags and attributes are preserved", () => {
  const out = sanitiseEmailHtml('<p>Hello <strong>world</strong></p>');
  assert.equal(out, "<p>Hello <strong>world</strong></p>");
});

test("allowed href/src/alt attributes survive, other attrs dropped", () => {
  assert.equal(
    sanitiseEmailHtml('<a href="https://x.com" class="z" data-x="1">go</a>'),
    '<a href="https://x.com">go</a>',
  );
  assert.equal(
    sanitiseEmailHtml('<img src="https://x.com/a.png" alt="pic" id="hero" style="x">'),
    '<img src="https://x.com/a.png" alt="pic">',
  );
});

test("<script> is removed together with its content", () => {
  assert.equal(sanitiseEmailHtml('a<script>alert(1)</script>b'), "ab");
});

test("<style> is removed together with its content", () => {
  assert.equal(sanitiseEmailHtml('a<style>.x{color:red}</style>b'), "ab");
});

test("<svg onload> is removed together with its content", () => {
  assert.equal(sanitiseEmailHtml('a<svg onload=alert(1)><rect></svg>b'), "ab");
});

test("on* event handlers are stripped from kept tags", () => {
  assert.equal(
    sanitiseEmailHtml('<div onclick="x()" onmouseover=\'y()\'>hi</div>'),
    "<div>hi</div>",
  );
});

test("javascript: href is dropped", () => {
  assert.equal(sanitiseEmailHtml('<a href="javascript:alert(1)">x</a>'), "<a>x</a>");
});

test("data:text href is dropped, data:image src is kept", () => {
  assert.equal(sanitiseEmailHtml('<a href="data:text/html,x">x</a>'), "<a>x</a>");
  assert.equal(
    sanitiseEmailHtml('<img src="data:image/png;base64,AAAA">'),
    '<img src="data:image/png;base64,AAAA">',
  );
});

test("nested/split <scr<script>ipt> is neutralised", () => {
  const out = sanitiseEmailHtml('<scr<script>ipt>alert(1)</script>');
  assert.ok(!/<script/i.test(out), `unexpected script tag in: ${out}`);
  assert.ok(!out.includes("alert(1)"), `payload leaked in: ${out}`);
});

test("disallowed tags drop brackets but keep inner text", () => {
  assert.equal(sanitiseEmailHtml('<marquee>scroll</marquee>'), "scroll");
});

test("HTML comments are stripped, plain text preserved", () => {
  assert.equal(sanitiseEmailHtml('a<!-- secret -->b'), "ab");
  assert.equal(sanitiseEmailHtml('just plain text'), "just plain text");
});
