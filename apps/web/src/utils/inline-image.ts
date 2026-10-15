/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAX_INLINE_IMAGE_CHARACTERS=2_000_000;
const MAX_INLINE_IMAGE_BYTES=1_000_000;
const formats:Record<string,string>={"image/svg+xml":"svg","image/png":"png","image/jpeg":"jpg","image/webp":"webp"};

/** Decode bounded embedded artwork into a normal persisted asset. No external URL is fetched. */
export async function inlineImageFile(value:string):Promise<File>{
  if(typeof value!=="string" || value.length>MAX_INLINE_IMAGE_CHARACTERS)throw new RangeError("Inline artwork exceeds the 2 MB encoded limit");
  const mime=/^data:(image\/(?:svg\+xml|png|jpeg|webp))(?:;[^,]*)?,/i.exec(value)?.[1].toLowerCase();
  if(!mime || !formats[mime])throw new TypeError("Inline artwork must be SVG, PNG, JPEG or WebP image data");
  const response=await fetch(value);
  const blob=await response.blob();
  if(!blob.size || blob.size>MAX_INLINE_IMAGE_BYTES)throw new RangeError("Inline artwork must contain 1..1000000 decoded bytes");
  return new File([blob],`inline-artwork.${formats[mime]}`,{type:mime});
}
