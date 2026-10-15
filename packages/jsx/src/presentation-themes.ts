/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { DOCUMENTARY_THEME } from "./documentary";
import { EDUCATION_THEME } from "./education-core";
import type { DocumentaryTheme } from "./documentary";
import type { EducationTheme } from "./education-core";

/** Whole, compatible card themes. Existing component defaults remain unchanged. */
export const PRESENTATION_THEMES = Object.freeze({
  documentary: Object.freeze({
    ink: DOCUMENTARY_THEME,
    paper: Object.freeze({ background: "#F3EBDD", surface: "#E7DCC8", text: "#202B30", muted: "#505E62", accent: "#8C3C24", fontFamily: "Georgia" } satisfies DocumentaryTheme),
  }),
  education: Object.freeze({
    technical: EDUCATION_THEME,
    classroom: Object.freeze({ background: "#F3F0E7", surface: "#E2E8E5", text: "#18383A", muted: "#415B5D", accent: "#1C6564", success: "#24613B", fontFamily: "Georgia", monoFamily: "Consolas" } satisfies EducationTheme),
  }),
});
