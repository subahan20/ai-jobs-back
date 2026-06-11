import dotenv from 'dotenv';
import app from './src/server.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📡 REST API Endpoints:`);
  console.log(`   - GET    /api/jobs (Query: search, experience_level, source, location, sort_by, sort_order, page, limit)`);
  console.log(`   - GET    /api/jobs/:id`);
  console.log(`   - POST   /api/jobs`);
  console.log(`   - PUT    /api/jobs/:id`);
  console.log(`   - DELETE /api/jobs/:id`);
  console.log(`   - GET    /api/ai-search`);
  console.log(`   - POST   /api/ai-search`);
  console.log(`   - GET    /api/ai-search/status/:searchId`);
  console.log(`   - GET    /api/profile`);
  console.log(`   - POST   /api/profile`);
  console.log(`===================================================`);
});
