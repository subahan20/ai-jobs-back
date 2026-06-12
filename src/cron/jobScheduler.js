import cron from 'node-cron';
import { runAllScrapers } from '../services/jobScraperService.js';

// Define some generic broad searches to run globally every 6 hours
const GLOBAL_SEARCHES = [
  { keyword: 'Software Engineer', location: 'India' },
  { keyword: 'Frontend Developer React', location: 'India' },
  { keyword: 'Backend Developer Node', location: 'India' }
];

export function initCronJobs() {
  console.log('[Cron] Initializing scheduled job scraping...');

  // Run every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Triggering global 6-hour scrape...');
    
    for (const search of GLOBAL_SEARCHES) {
      try {
        await runAllScrapers(search.keyword, search.location);
        // Add a delay between runs to avoid Apify rate limiting
        await new Promise((resolve) => setTimeout(resolve, 30000));
      } catch (err) {
        console.error(`[Cron] Global scrape failed for ${search.keyword}:`, err.message);
      }
    }
    
    console.log('[Cron] Global 6-hour scrape completed.');
  });
}
