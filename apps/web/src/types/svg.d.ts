/** SVG files are imported as raw markup (see the `.svg` text loader in angular.json). */
declare module '*.svg' {
  const markup: string;
  export default markup;
}
