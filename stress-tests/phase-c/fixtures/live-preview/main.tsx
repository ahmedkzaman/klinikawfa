import { createRoot } from "react-dom/client";

import "../../../../src/index.css";
import { LivePreviewHarness } from "./LivePreviewHarness";

createRoot(document.getElementById("root")!).render(<LivePreviewHarness />);
