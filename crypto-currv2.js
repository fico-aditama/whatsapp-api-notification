import axios from 'axios';

// Daftar blue-chip crypto
const coins = ['bitcoin', 'ethereum', 'binancecoin'];
const CACHE_DURATION = 5 * 60 * 1000; // Cache 5 menit
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

// Fungsi untuk mengambil harga dan kurs IDR dari CoinGecko
const fetchPrices = async () => {
    try {
        const coinIds = coins.join(',');
        const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd,idr`;

        // Cek cache
        if (apiCache['coingecko-prices'] && Date.now() - apiCache['coingecko-prices'].timestamp < CACHE_DURATION) {
            console.log('Menggunakan cache untuk CoinGecko');
            return apiCache['coingecko-prices'].data;
        }

        const response = await axios.get(apiUrl, { timeout: 5000 });
        if (response.status !== 200) {
            throw new Error('Gagal mengambil data harga');
        }

        // Simpan ke cache
        apiCache['coingecko-prices'] = {
            data: response.data,
            timestamp: Date.now(),
        };

        return response.data;
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
    const prices = await fetchPrices();
    if (!prices) {
        console.log('Gagal menampilkan harga. Mencoba lagi...');
        return;
    }

    const timestamp = new Date();
    console.clear();
    console.log(`Harga Crypto Blue-Chip (Terakhir diperbarui: ${formatTimestamp(timestamp)})`);
    console.table(
        coins.map((coin) => ({
            Koin: coin.charAt(0).toUpperCase() + coin.slice(1),
            'Harga (USD)': formatPrice(prices[coin]?.usd, 'USD'),
            'Harga (IDR)': formatPrice(prices[coin]?.idr, 'IDR'),
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