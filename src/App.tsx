import { Chat } from "./Chat";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Dbg } from "./Dbg";
import { trpc, trpcClient } from "./utils/trpc";

export function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="px-8 py-8 text-center relative z-10">
          <Chat />
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export default App;
