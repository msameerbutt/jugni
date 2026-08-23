/* Preact + htm, bound once. Every component imports `html` from here rather
   than wiring the binding itself. */
import { h } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);
export { h } from 'preact';
export { Fragment } from 'preact';
