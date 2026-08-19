import { createContext } from "react";

// GATE-10B.1C: the shared Context object itself, split into its own module
// so both ThemeProvider.jsx (component-only, for react-refresh) and
// useTheme.js (hook-only) can import the same instance without either
// file mixing component/non-component exports.
export const ThemeContext = createContext(null);
