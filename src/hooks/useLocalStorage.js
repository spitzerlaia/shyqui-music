import { useState, useEffect } from "react";
import { load, save } from "../utils/helpers";

export function useLocalStorage(key, initialValue, normalize) {
  const [value, setValue] = useState(() => {
    const v = load(key, initialValue);
    return normalize ? normalize(v) : v;
  });
  useEffect(() => { save(key, value); }, [key, value]);
  return [value, setValue];
}
