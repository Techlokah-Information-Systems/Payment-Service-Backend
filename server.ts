import app from "./app";
import { PORT } from "./utils/constants";

const port = PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("Shutting down server...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}
