/** Process-realm lazy access to Koffi's CommonJS entry. */

import type koffi from 'koffi'
import { createRequire } from 'node:module'
const createLazyRequire = <T>(name: string, url: string): (() => T) => { const require = createRequire(url); return () => require(name) as T }

/** Koffi runtime export type. */
export type Koffi = typeof koffi

/** Load Koffi on the first Win32 native operation. */
export const requireKoffi = createLazyRequire<Koffi>('koffi', import.meta.url)
