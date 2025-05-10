import axios from 'axios';

// Daftar blue-chip crypto dan trading pair di Binance
const coins = [
    { id: 'bitcoin', symbol: 'BTCUSDT' },
    { id: 'ethereum', symbol: 'ETHUSDT' },
    { id: 'binancecoin', symbol: 'BNBUSDT' },
];
// const CACHE_DURATION = 5 * 60 * 1000; // Cache 5 menit
const CACHE_DURATION = 1; // Cache 5 menit
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

// Fungsi untuk mengambil harga dari Binance API
const fetchBinancePrices = async () => {
    try {
        const symbols = coins.map(coin => coin.symbol).join(',');
        const apiUrl = `https://api.binance.com/api/v3/ticker/price?symbols=["${symbols.split(',').join('","')}"]`;

        // Cek cache
        if (apiCache['binance-prices'] && Date.now() - apiCache['binance-prices'].timestamp < CACHE_DURATION) {
            return apiCache['binance-prices'].data;
        }

        const response = await axios.get(apiUrl);
        if (response.status !== 200) {
            throw new Error('Gagal mengambil harga dari Binance');
        }

        // Format data ke objek dengan id koin
        const prices = {};
        response.data.forEach(item => {
            const coin = coins.find(c => c.symbol === item.symbol);
            if (coin) {
                prices[coin.id] = parseFloat(item.price);
            }
        });

        // Simpan ke cache
        apiCache['binance-prices'] = {
            data: prices,
            timestamp: Date.now(),
        };

        return prices;
    } catch (err) {
        console.error(`Error Binance: ${err.message}`);
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk mengambil kurs USD/IDR dari CoinGecko
const fetchIdrRate = async () => {
    try {
        const apiUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr';

        // Cek cache
        if (apiCache['idr-rate'] && Date.now() - apiCache['idr-rate'].timestamp < CACHE_DURATION) {
            return apiCache['idr-rate'].data;
        }

        const response = await axios.get(apiUrl);
        if (response.status !== 200) {
            throw new Error('Gagal mengambil kurs IDR dari CoinGecko');
        }

        const rate = response.data.tether.idr;

        // Simpan ke cache
        apiCache['idr-rate'] = {
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

// Fungsi untuk format timestamp
const formatTimestamp = (date) => {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// Fungsi utama untuk menampilkan harga
const displayPrices = async () => {
    const prices = await fetchBinancePrices();
    const idrRate = await fetchIdrRate();

    if (!prices || !idrRate) {
        console.log('Gagal menampilkan harga. Mencoba lagi...');
        return;
    }

    const timestamp = new Date();
    console.clear(); // Bersihkan terminal untuk tampilan rapi
    console.log(`Harga Crypto Blue-Chip (Terakhir diperbarui: ${formatTimestamp(timestamp)})`);
    console.log(`Kurs USDT/IDR: ${formatPrice(idrRate, 'IDR')}`);
    console.table(
        coins.map((coin) => ({
            Koin: coin.id.charAt(0).toUpperCase() + coin.id.slice(1),
            'Harga (USD)': formatPrice(prices[coin.id], 'USD'),
            'Harga (IDR)': formatPrice(prices[coin.id] * idrRate, 'IDR'),
        }))
    );
};

// Jalankan displayPrices setiap 5 detik
const main = () => {
    displayPrices();
    const interval = setInterval(displayPrices, 5000);

    // Bersihkan interval saat skrip dihentikan (Ctrl+C)
    process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('Skrip dihentikan.');
        process.exit(0);
    });
};

// Jalankan skrip
main();