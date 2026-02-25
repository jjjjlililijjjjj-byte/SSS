import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const SHARES_DIR = path.resolve(process.cwd(), 'shares');
  if (!fs.existsSync(SHARES_DIR)) {
    fs.mkdirSync(SHARES_DIR);
  }

  // API Routes
  app.post("/api/share", (req, res) => {
    try {
      const data = req.body;
      const id = uuidv4();
      fs.writeFileSync(path.join(SHARES_DIR, `${id}.json`), JSON.stringify(data));
      res.json({ id });
    } catch (error) {
      console.error("Share error:", error);
      res.status(500).json({ error: "Failed to share library" });
    }
  });

  app.get("/api/share/:id", (req, res) => {
    try {
      const { id } = req.params;
      const filePath = path.join(SHARES_DIR, `${id}.json`);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        res.json(JSON.parse(data));
      } else {
        res.status(404).json({ error: "Share not found" });
      }
    } catch (error) {
      console.error("Load share error:", error);
      res.status(500).json({ error: "Failed to load shared library" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
