import type { Message } from "@anthropic-ai/sdk/resources";
import { APITester } from "./APITester";
import "./index.css";

import logo from "./logo.svg";
import reactLogo from "./react.svg";
import { useState } from "react";

export function App() {
	return (
		<div className="px-8 py-8 text-center relative z-10">
			<APITester />
		</div>
	);
}

export default App;
