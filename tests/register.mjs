// Testy bežia priamo v Node (bez bundlera). Kód appky importuje TS moduly
// bez prípony (ako to vyžaduje Next.js), tak im tu príponu .ts doplníme.
import { register } from "node:module";
register("./resolve-ts.mjs", import.meta.url);
