import { useState, useEffect } from "react";
import { load, save } from "../utils/helpers";

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => load(key, initialValue));
  useEffect(() => { save(key, value); }, [key, value]);
  return [value, setValue];
}
