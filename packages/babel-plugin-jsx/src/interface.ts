import type * as t from '@babel/types';
import type * as BabelCore from '@babel/core';
import { type Options } from '@v-c/babel-plugin-resolve-type';

export type Slots = t.Identifier | t.ObjectExpression | null;

export type State = {
  get: (name: string) => any;
  set: (name: string, value: any) => any;
  opts: VueJSXPluginOptions;
  file: BabelCore.BabelFile;
};

export interface VueJSXPluginOptions {
  /** transform `on: { click: xx }` to `onClick: xxx` */
  transformOn?: boolean;
  /** enable optimization or not. */
  optimize?: boolean;
  /** merge static and dynamic class / style attributes / onXXX handlers */
  mergeProps?: boolean;
  /** configuring custom elements */
  isCustomElement?: (tag: string) => boolean;
  /** enable object slots syntax */
  enableObjectSlots?: boolean;
  /** Replace the function used when compiling JSX expressions */
  pragma?: string;
  /**
   * (**Experimental**) Infer component metadata from types (e.g. `props`, `emits`, `name`)
   * @default false
   */
  resolveType?: Options | boolean;
}
