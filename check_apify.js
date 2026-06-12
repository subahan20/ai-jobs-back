import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
dotenv.config();

async function checkApify() {
  try {
    const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
    const user = await client.user('me').get();
    console.log('Apify User Profile:', user.profile.name);
    console.log('Apify Limits:', user.limits);
    console.log('Apify Current Usage:', user.currentUsage);
  } catch (error) {
    console.error('Apify Check Error:', error.message);
  }
}

checkApify();
