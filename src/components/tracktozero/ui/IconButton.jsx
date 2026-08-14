import React, { forwardRef } from "react";
import Button from "./Button.jsx";

// Thin Button wrapper for icon-only actions (UX-1 Part 9) - guarantees an
// accessible name via required `label`, since an icon alone conveys nothing
// to screen readers.
const IconButton = forwardRef(function IconButton({ label, children, ...rest }, ref) {
  return (
    <Button ref={ref} iconOnly aria-label={label} title={label} {...rest}>
      {children}
    </Button>
  );
});

export default IconButton;
