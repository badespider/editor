/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { VectorPathCommand } from "@diffusionstudio/jsx";

export interface DBEntity {
	id: string;
	eid: number;
	Geometry?: number;
	VectorPath?: { commands?: VectorPathCommand[]; fillEnabled?: boolean };
	Paint?: number;
	Group?: {};
	Scene?: {};
	Audio?: {};
	AdjustmentLayer?: {};
	Effect?: {
		type?: number;
		value?: number;
	};
	Caption?: {
		type?: number;
		colors?: number[];
		verticalAlign?: number;
	};
	IsMask?: {};
	ClipToBox?: {};
	Shadow?: {};
	Stroke?: {};
	Name?: string;
	Key?: string;
	MountScript?: {
		mountId: string;
		scriptAssetId: string;
	};
	MountPath?: {
		mountId: string;
		path: string;
	};
	ChildOf?: number;
	ItemIndex?: number;
	ClipHeight?: number;
	Expanded?: {};
	Position?: {
		x?: number;
		y?: number;
	};
	Offset?: {
		x?: number;
		y?: number;
	};
	Rotation?: number;
	Scale?: {
		x?: number;
		y?: number;
	};
	UniformScale?: number;
	Anchor?: {
		x?: number;
		y?: number;
	};
	Skew?: {
		x?: number;
		y?: number;
	};
	Size?: {
		width?: number;
		height?: number;
	};
	Flip?: {
		x?: -1 | 1;
		y?: -1 | 1;
	};
	Appearance?: {
		opacity?: number;
		blendMode?: number;
	};
	CornerRadius?: number;
	MixedCornerRadius?: {
		topLeft: number;
		topRight: number;
		bottomRight: number;
		bottomLeft: number;
	};
	Color?: number;
	Blur?: number;
	AssetId?: string;
	ScaleMode?: number;
	Shader?: {
		code?: string;
		uniforms?: Record<string, number | number[] | string>;
	};
	Volume?: number;
	Muted?: {};
	ColorStop?: {
		offset?: number;
		color?: number;
		opacity?: number;
	};
	StrokeStyle?: {
		width?: number;
		join?: number;
		cap?: number;
		miterLimit?: number;
	};
	Hidden?: boolean;
	ClipsContent?: boolean;
	Sequential?: {};
	Playback?: {
		loop?: number;
	};
	Delay?: number;
	PlaybackRate?: number;
	Trim?: {
		start?: number;
		end?: number;
	};
	Constraint?: {
		horizontal?: number;
		vertical?: number;
	};
	KeepAspectRatio?: {
		width?: number;
		height?: number;
	};
	Transition?: {
		type?: number;
		duration?: number;
	};
	KeyframeTrack?: {
		property?: string;
	};
	Keyframe?: {
		time?: number;
		value?: number;
		easing?: string;
	};
	Animation?: {
		duration?: number;
		delay?: number;
		type?: number;
		phase?: number;
	};
	Chars?: string;
	TextStyle?: {
		leading?: number;
		fontSize?: number;
		fontFamily?: string;
		fontWeight?: string;
		fontStyle?: number;
		textAlign?: number;
		textBaseline?: number;
		textCase?: number;
		letterSpacing?: number;
	};
};
