import { fileStorage } from "../lib/storage";
import { current } from "./context";
export function storage() {
  return fileStorage(current().files);
}
