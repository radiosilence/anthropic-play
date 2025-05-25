import { trpc } from "./utils/trpc";

export const Dbg = () => {
  const debugSend = trpc.debugSend.useMutation();
  trpc.onDebug.useSubscription(undefined, {
    onData: (data) => {
      console.log("DEBUG", data);
    },
  });
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          await Promise.all([
            [...new Array(200)].map(() => debugSend.mutateAsync()),
          ]);
        }}
      >
        DEBUG
      </button>
    </>
  );
};
