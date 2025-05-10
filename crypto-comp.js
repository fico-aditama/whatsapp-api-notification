import axios from 'axios';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';

// Konfigurasi API Keys dan WhatsApp
const CONFIG = {
};

// Inisialisasi WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] },
});

// Daftar crypto, saham, logam, dan konfigurasi
const cryptoCoins = [
    'bitcoin', 'ethereum', 'binancecoin', 'solana', 'xrp',
    'cardano', 'dogecoin', 'tron', 'avalanche-2', 'shiba-inu'
].map(id => ({ id, symbol: `${id.toUpperCase()}USDT` }));
const blueChipStocks = [
    'AAPL', 'MSFT', 'JPM', 'V', 'WMT',
    'PG', 'JNJ', 'HD', 'KO', 'MRK'
];
const metals = ['XAU', 'XAG', 'XPT', 'XPD']; // Emas, Perak, Platinum, Paladium
const currencies = ['USD', 'EUR', 'GBP', 'JPY'];
const CACHE_DURATION = 5 * 60 * 1000; // Cache 5 menit
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const apiCache = {};
const binanceEndpoints = [
    'https://api.binance.com',
    'https://api1.binance.com',
    'https://api2.binance.com',
    'https://api3.binance.com',
];

// Fungsi untuk membersihkan cache
const cleanCache = () => {
    const now = Date.now();
    for (const key in apiCache) {
        if (now - apiCache[key].timestamp > CACHE_DURATION) {
            delete apiCache[key];
        }
    }
};

// Fungsi untuk mengambil harga crypto dari Binance
const fetchCryptoPrices = async (endpointIndex = 0, retries = 0) => {
    const endpoint = binanceEndpoints[endpointIndex];
    try {
        const symbols = cryptoCoins.map(coin => coin.symbol).join(',');
        const apiUrl = `${endpoint}/api/v3/ticker/price?symbols=["${symbols.split(',').join('","')}"]`;

        console.log(`Mengambil harga crypto dari: ${apiUrl}`);

        const cacheKey = `crypto-prices-${endpointIndex}`;
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log(`Menggunakan cache untuk ${endpoint}`);
            return apiCache[cacheKey].data;
        }

        const response = await axios.get(apiUrl, { timeout: 5000 });
        if (response.status !== 200) {
            throw new Error(`Status tidak OK: ${response.status}`);
        }

        const prices = {};
        response.data.forEach(item => {
            const coin = cryptoCoins.find(c => c.symbol === item.symbol);
            if (coin) {
                prices[coin.id] = parseFloat(item.price);
            }
        });

        apiCache[cacheKey] = {
            data: prices,
            timestamp: Date.now(),
        };

        return prices;
    } catch (err) {
        console.error(`Error Binance (${endpoint}): ${err.message}`);
        if (err.code === 'ENOTFOUND' && retries < MAX_RETRIES) {
            console.log(`Mencoba ulang (${retries + 1}/${MAX_RETRIES}) setelah ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchCryptoPrices(endpointIndex, retries + 1);
        } else if (endpointIndex < binanceEndpoints.length - 1) {
            console.log(`Gagal dengan ${endpoint}. Mencoba: ${binanceEndpoints[endpointIndex + 1]}`);
            return fetchCryptoPrices(endpointIndex + 1, 0);
        }
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk mengambil harga saham dari Alpha Vantage
const fetchStockPrices = async () => {
    try {
        const cacheKey = 'stock-prices';
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk saham');
            return apiCache[cacheKey].data;
        }

        const prices = {};
        for (const symbol of blueChipStocks) {
            const apiUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${CONFIG.ALPHA_VANTAGE_API_KEY}`;
            const response = await axios.get(apiUrl, { timeout: 5000 });
            if (response.status !== 200 || !response.data['Global Quote']) {
                console.error(`Gagal mengambil saham ${symbol}`);
                continue;
            }
            const price = parseFloat(response.data['Global Quote']['05. price']);
            prices[symbol] = price;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Hindari rate limit
        }

        apiCache[cacheKey] = {
            data: prices,
            timestamp: Date.now(),
        };

        return prices;
    } catch (err) {
        console.error(`Error Alpha Vantage: ${err.message}`);
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk mengambil harga logam dari MetalpriceAPI
const fetchMetalPrices = async () => {
    try {
        const cacheKey = 'metal-prices';
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk logam');
            return apiCache[cacheKey].data;
        }

        const apiUrl = `https://api.metalpriceapi.com/v1/latest?api_key=${CONFIG.METALPRICE_API_KEY}&base=USD&currencies=${metals.join(',')}`;
        const response = await axios.get(apiUrl, { timeout: 5000 });
        if (response.status !== 200 || !response.data.success) {
            throw new Error('Gagal mengambil harga logam');
        }

        const prices = {};
        metals.forEach(metal => {
            // Harga per troy ons
            prices[metal] = 1 / parseFloat(response.data.rates[metal]);
        });

        apiCache[cacheKey] = {
            data: prices,
            timestamp: Date.now(),
        };

        return prices;
    } catch (err) {
        console.error(`Error MetalpriceAPI: ${err.message}`);
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk mengambil kurs dari ExchangeRate-API
const fetchExchangeRates = async () => {
    try {
        const cacheKey = 'exchange-rates';
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk kurs');
            return apiCache[cacheKey].data;
        }

        const apiUrl = `https://v6.exchangerate-api.com/v6/${CONFIG.EXCHANGE_RATE_API_KEY}/latest/USD`;
        const response = await axios.get(apiUrl, { timeout: 5000 });
        if (response.status !== 200 || !response.data.conversion_rates) {
            throw new Error('Gagal mengambil kurs');
        }

        const rates = {};
        currencies.forEach(currency => {
            rates[currency] = response.data.conversion_rates[currency];
        });

        apiCache[cacheKey] = {
            data: rates,
            timestamp: Date.now(),
        };

        return rates;
    } catch (err) {
        console.error(`Error ExchangeRate-API: ${err.message}`);
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk mengambil cuaca dari OpenWeatherMap
const fetchWeather = async () => {
    try {
        const cacheKey = 'weather';
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk cuaca');
            return apiCache[cacheKey].data;
        }

        const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${CONFIG.CITY}&appid=${CONFIG.OPENWEATHER_API_KEY}&units=metric`;
        const response = await axios.get(apiUrl, { timeout: 5000 });
        if (response.status !== 200) {
            throw new Error('Gagal mengambil cuaca');
        }

        const weather = {
            temp: response.data.main.temp,
            description: response.data.weather[0].description,
        };

        apiCache[cacheKey] = {
            data: weather,
            timestamp: Date.now(),
        };

        return weather;
    } catch (err) {
        console.error(`Error OpenWeatherMap: ${err.message}`);
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk mengambil kurs USD/IDR dari CoinGecko
const fetchIdrRate = async () => {
    try {
        const cacheKey = 'idr-rate';
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk kurs IDR');
            return apiCache[cacheKey].data;
        }

        const apiUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr';
        const response = await axios.get(apiUrl, { timeout: 5000 });
        if (response.status !== 200) {
            throw new Error('Status tidak OK');
        }

        const rate = response.data.tether.idr;
        apiCache[cacheKey] = {
            data: rate,
            timestamp: Date.now(),
        };

        return rate;
    } catch (err) {
        console.error(`Error CoinGecko: ${err.message}`);
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk format harga
const formatPrice = (price, currency = 'USD') => {
    if (!price) return 'N/A';
    if (currency === 'USD') {
        return `$${price.toFixed(2)}`;
    } else if (currency === 'IDR') {
        return `Rp${price.toLocaleString('id-ID', { minimumFractionDigits: 0 })}`;
    }
};

// Fungsi untuk format pesan WhatsApp
const formatMessage = (cryptoPrices, stockPrices, metalPrices, exchangeRates, weather, idrRate, timestamp) => {
    const formatTimestamp = timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let message = `📊 *Update Pasar (Terakhir diperbarui: ${formatTimestamp})* 📊\n\n`;

    // Crypto
    message += `*Top 10 Cryptocurrencies*\n`;
    cryptoPrices ? cryptoCoins.forEach(coin => {
        const priceUsd = cryptoPrices[coin.id];
        message += `${coin.id.charAt(0).toUpperCase() + coin.id.slice(1)}: ${formatPrice(priceUsd, 'USD')} | ${formatPrice(priceUsd * idrRate, 'IDR')}\n`;
    }) : message += 'Gagal mengambil harga crypto.\n';
    message += '\n';

    // Saham
    message += `*Top 10 Saham Blue-Chip US*\n`;
    stockPrices ? blueChipStocks.forEach(symbol => {
        const price = stockPrices[symbol];
        message += `${symbol}: ${formatPrice(price, 'USD')} | ${formatPrice(price * idrRate, 'IDR')}\n`;
    }) : message += 'Gagal mengambil harga saham.\n';
    message += '\n';

    // Logam Mulia
    message += `*Harga Logam Mulia (per troy ons)*\n`;
    metalPrices ? metals.forEach(metal => {
        const name = { 'XAU': 'Emas', 'XAG': 'Perak', 'XPT': 'Platinum', 'XPD': 'Paladium' }[metal];
        const price = metalPrices[metal];
        message += `${name}: ${formatPrice(price, 'USD')} | ${formatPrice(price * idrRate, 'IDR')}\n`;
    }) : message += 'Gagal mengambil harga logam.\n';
    message += '\n';

    // Kurs
    message += `*Kurs Mata Uang (Base: USD)*\n`;
    exchangeRates ? currencies.forEach(currency => {
        if (currency !== 'USD') {
            message += `USD/${currency}: ${exchangeRates[currency]?.toFixed(4) || 'N/A'}\n`;
        }
    }) : message += 'Gagal mengambil kurs.\n';
    message += `USD/IDR: ${formatPrice(idrRate, 'IDR')}\n`;
    message += '\n';

    // Cuaca
    message += `*Cuaca ${CONFIG.CITY}*\n`;
    message += weather ? `Suhu: ${weather.temp}°C\nKondisi: ${weather.description.charAt(0).toUpperCase() + weather.description.slice(1)}\n` : 'Gagal mengambil cuaca.\n';

    return message;
};

// Fungsi utama untuk mengambil dan mengirim data
const updateAndSend = async () => {
    try {
        console.log('Mengambil data...');
        const cryptoPrices = await fetchCryptoPrices();
        const stockPrices = await fetchStockPrices();
        const metalPrices = await fetchMetalPrices();
        const exchangeRates = await fetchExchangeRates();
        const weather = await fetchWeather();
        const idrRate = await fetchIdrRate();

        const timestamp = new Date();
        const message = formatMessage(cryptoPrices, stockPrices, metalPrices, exchangeRates, weather, idrRate, timestamp);

        // Kirim ke WhatsApp
        if (client.info) {
            await client.sendMessage(CONFIG.WHATSAPP_TO, message);
            console.log(`Pesan dikirim ke ${CONFIG.WHATSAPP_TO} pada ${formatTimestamp(timestamp)}`);
        } else {
            console.log('WhatsApp client belum siap.');
        }

        // Tampilkan di terminal
        console.clear();
        console.log(message);
    } catch (err) {
        console.error(`Error di updateAndSend: ${err.message}`);
    }
};

// Setup WhatsApp client
client.on('qr', qr => {
    console.log('Scan QR code berikut untuk login WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp client siap!');
    // Jalankan update pertama
    updateAndSend();
    // Jadwalkan update setiap 1 menit
    const interval = setInterval(updateAndSend, 60 * 1000);

    // Bersihkan interval saat skrip dihentikan
    process.on('SIGINT', () => {
        clearInterval(interval);
        client.destroy();
        console.log('Skrip dihentikan.');
        process.exit(0);
    });
});

client.on('disconnected', (reason) => {
    console.log(`WhatsApp disconnected: ${reason}`);
    client.initialize();
});

// Jalankan client
client.initialize();