import React, { forwardRef } from "react";
import Input from "./Input.jsx";

// Native date entry (UX-1 Part 19) - relies on the browser's own date
// picker/locale formatting rather than a custom widget. Value stays an ISO
// "YYYY-MM-DD" string, matching what UX-0's domain layer already expects.
const DateInput = forwardRef(function DateInput(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});

export default DateInput;
