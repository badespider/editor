import assert from "node:assert/strict";
import test from "node:test";
import {inlineImageFile} from "../src/utils/inline-image.ts";

test("embedded original artwork becomes a standard file with exact bytes",async()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>';
  const file=await inlineImageFile("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg));
  assert.equal(file.type,"image/svg+xml");assert.equal(file.name,"inline-artwork.svg");assert.equal(await file.text(),svg);
  const png=await inlineImageFile("data:image/png;base64,iVBORw0KGgo=");
  assert.equal(png.type,"image/png");assert.equal(png.size,8);
});
test("unsupported, empty, malformed and excessive inline sources reject without a remote fetch",async()=>{
  for(const value of ["https://example.com/image.png","data:text/html,<script/>","data:image/png;base64,","data:image/png;base64,!","data:image/svg+xml,"+"x".repeat(2_000_001),"data:image/png;base64,"+Buffer.alloc(1_000_001).toString("base64")])await assert.rejects(inlineImageFile(value));
});
