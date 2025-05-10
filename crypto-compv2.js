import axios from 'axios';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
dotenv.config();

// Konfigurasi API Keys dan WhatsApp
const CONFIG = {
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
    METALPRICE_API_KEY: process.env.METALPRICE_API_KEY,
    EXCHANGE_RATE_API_KEY: process.env.EXCHANGE_RATE_API_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
    WHATSAPP_TO: process.env.WHATSAPP_TO,
    CITIES: process.env.CITIES.split(','), // Ubah string ke array
};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] },
});

// Daftar crypto, saham, logam, dan konfigurasi
const cryptoCoins = [
    'bitcoin', 'ethereum', 'binancecoin', 'solana', 'xrp',
    'cardano', 'dogecoin', 'tron', 'avalanche-2', 'shiba-inu'
];
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

// Fungsi untuk membersihkan cache
const cleanCache = () => {
    const now = Date.now();
    for (const key in apiCache) {
        if (now - apiCache[key].timestamp > CACHE_DURATION) {
            delete apiCache[key];
        }
    }
};

// Fungsi untuk mengambil harga crypto dari CoinGecko
const fetchCryptoPrices = async (retries = 0) => {
    try {
        const cacheKey = 'crypto-prices';
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk crypto');
            return apiCache[cacheKey].data;
        }

        const coinIds = cryptoCoins.join(',');
        const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`;
        console.log(`Mengambil harga crypto dari: ${apiUrl}`);

        const response = await axios.get(apiUrl, { timeout: 5000 });
        if (response.status !== 200) {
            throw new Error(`Status tidak OK: ${response.status}`);
        }

        const prices = {};
        cryptoCoins.forEach(coin => {
            prices[coin] = parseFloat(response.data[coin]?.usd || 0);
        });

        apiCache[cacheKey] = {
            data: prices,
            timestamp: Date.now(),
        };

        return prices;
    } catch (err) {
        console.error(`Error CoinGecko: ${err.message}`);
        if (err.code === 'ENOTFOUND' && retries < MAX_RETRIES) {
            console.log(`Mencoba ulang (${retries + 1}/${MAX_RETRIES}) setelah ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchCryptoPrices(retries + 1);
        }
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk mengambil harga saham dari Finnhub
const fetchStockPrices = async () => {
    try {
        const cacheKey = 'stock-prices';
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk saham');
            return apiCache[cacheKey].data;
        }

        const prices = {};
        for (const symbol of blueChipStocks) {
            const apiUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${CONFIG.FINNHUB_API_KEY}`;
            console.log(`Mengambil harga saham ${symbol} dari: ${apiUrl}`);
            const response = await axios.get(apiUrl, { timeout: 5000 });
            if (response.status !== 200 || !response.data.c) {
                console.error(`Gagal mengambil saham ${symbol}`);
                continue;
            }
            const price = parseFloat(response.data.c); // Current price
            prices[symbol] = price;
            await new Promise(resolve => setTimeout(resolve, 500)); // Hindari rate limit
        }

        apiCache[cacheKey] = {
            data: prices,
            timestamp: Date.now(),
        };

        return prices;
    } catch (err) {
        console.error(`Error Finnhub: ${err.message}`);
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
        console.log(`Mengambil harga logam dari: ${apiUrl}`);
        const response = await axios.get(apiUrl, { timeout: 5000 });
        if (response.status !== 200 || !response.data.success) {
            throw new Error('Gagal mengambil harga logam');
        }

        const prices = {};
        metals.forEach(metal => {
            prices[metal] = 1 / parseFloat(response.data.rates[metal]); // Harga per troy ons
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
        console.log(`Mengambil kurs dari: ${apiUrl}`);
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

// Fungsi untuk mengambil cuaca dari OpenWeatherMap untuk beberapa kota
const fetchWeather = async () => {
    try {
        const cacheKey = 'weather';
        if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk cuaca');
            return apiCache[cacheKey].data;
        }

        const weatherData = {};
        for (const city of CONFIG.CITIES) {
            const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city},ID&appid=${CONFIG.OPENWEATHER_API_KEY}&units=metric`;
            console.log(`Mengambil cuaca untuk ${city} dari: ${apiUrl}`);
            const response = await axios.get(apiUrl, { timeout: 5000 });
            if (response.status !== 200) {
                console.error(`Gagal mengambil cuaca untuk ${city}`);
                weatherData[city] = null;
                continue;
            }
            weatherData[city] = {
                temp: response.data.main.temp,
                description: response.data.weather[0].description,
            };
            await new Promise(resolve => setTimeout(resolve, 500)); // Hindari rate limit
        }

        apiCache[cacheKey] = {
            data: weatherData,
            timestamp: Date.now(),
        };

        return weatherData;
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
        console.log(`Mengambil kurs IDR dari: ${apiUrl}`);
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
        console.error(`Error CoinGecko (IDR): ${err.message}`);
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
    const formatTimestamp = timestamp.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    let message = "```text\n";
    message += `📊 UPDATE PASAR - ${formatTimestamp} WIB 📊\n\n`;

    // Crypto
    message += `🪙 Top 10 Crypto\n`;
    message += `Nama         USD        IDR\n`;
    if (cryptoPrices) {
        cryptoCoins.forEach(coin => {
            const name = coin.charAt(0).toUpperCase() + coin.slice(1);
            const priceUsd = cryptoPrices[coin];
            const usd = formatPrice(priceUsd, 'USD').padEnd(10);
            const idr = formatPrice(priceUsd * idrRate, 'IDR');
            message += `${name.padEnd(13)}${usd} ${idr}\n`;
        });
    } else {
        message += `Gagal mengambil harga crypto.\n`;
    }

    message += `\n`;

    // Saham
    message += `📈 Blue-Chip US Stocks\n`;
    message += `Kode     USD       IDR\n`;
    if (stockPrices) {
        blueChipStocks.forEach(symbol => {
            const price = stockPrices[symbol];
            const usd = formatPrice(price, 'USD').padEnd(10);
            const idr = formatPrice(price * idrRate, 'IDR');
            message += `${symbol.padEnd(8)}${usd} ${idr}\n`;
        });
    } else {
        message += `Gagal mengambil harga saham.\n`;
    }

    message += `\n`;

    // Logam Mulia
    message += `🥇 Logam Mulia (per troy ons)\n`;
    message += `Nama        USD        IDR\n`;
    if (metalPrices) {
        metals.forEach(metal => {
            const nameMap = {
                'XAU': 'Emas',
                'XAG': 'Perak',
                'XPT': 'Platinum',
                'XPD': 'Paladium',
            };
            const name = nameMap[metal].padEnd(12);
            const price = metalPrices[metal];
            const usd = formatPrice(price, 'USD').padEnd(10);
            const idr = formatPrice(price * idrRate, 'IDR');
            message += `${name}${usd} ${idr}\n`;
        });
    } else {
        message += `Gagal mengambil harga logam.\n`;
    }

    message += `\n`;

    // Kurs Mata Uang
    message += `💱 Kurs (USD ke Mata Uang Lain)\n`;
    if (exchangeRates) {
        currencies.forEach(currency => {
            if (currency !== 'USD') {
                const rate = exchangeRates[currency]?.toFixed(4) || 'N/A';
                message += `USD/${currency.padEnd(3)}: ${rate}\n`;
            }
        });
    } else {
        message += `Gagal mengambil kurs.\n`;
    }

    message += `USD/IDR : ${formatPrice(idrRate, 'IDR')}\n\n`;

    // Cuaca
    message += `🌦️ Cuaca Indonesia\n`;
    if (weather) {
        CONFIG.CITIES.forEach(city => {
            const data = weather[city];
            if (data) {
                const temp = `${data.temp}°C`.padEnd(6);
                const desc = data.description.charAt(0).toUpperCase() + data.description.slice(1);
                message += `${city.padEnd(12)} ${temp} ${desc}\n`;
            } else {
                message += `${city.padEnd(12)} Gagal mengambil data\n`;
            }
        });
    } else {
        message += `Gagal mengambil data cuaca.\n`;
    }

    message += "```"; // Akhiri blok monospaced
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
            console.log(`Pesan dikirim ke ${CONFIG.WHATSAPP_TO} pada ${timestamp.toLocaleTimeString('id-ID')}`);
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