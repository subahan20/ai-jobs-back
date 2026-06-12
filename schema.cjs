const https = require('https');
https.get('https://api.apify.com/v2/acts/curious_coder~linkedin-jobs-scraper', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(JSON.parse(data).data.inputSchema));
});
https.get('https://api.apify.com/v2/acts/misceres~indeed-scraper', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(JSON.parse(data).data.inputSchema));
});
https.get('https://api.apify.com/v2/acts/easyapi~naukri-jobs-scraper', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(JSON.parse(data).data.inputSchema));
});
