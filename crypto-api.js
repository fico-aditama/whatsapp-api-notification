import axios from 'axios';

// Daftar blue-chip crypto
const coins = ['bitcoin', 'ethereum', 'binancecoin'];
const CACHE_DURATION = 5 * 60 * 1000; // Cache 5 menit
const apiCache = {};

// Fungsi untuk membersihkan cache
const cleanCache = () => {
    const now = Date.now();
    for (const coinId in apiCache) {
        if (now - apiCache[coinId].timestamp > CACHE_DURATION) {
            delete apiCache[coinId];
        }
    }
};

// Fungsi untuk mengambil harga
const fetchPrices = async () => {
    try {
        const coinIds = coins.join(',');
        const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`;

        // Cek cache
        if (apiCache[coinIds] && Date.now() - apiCache[coinIds].timestamp < CACHE_DURATION) {
            return apiCache[coinIds].data;
        }

        const response = await axios.get(apiUrl);
        if (response.status !== 200) {
            throw new Error('Gagal mengambil data harga');
        }

        // Simpan ke cache
        apiCache[coinIds] = {
            data: response.data,
            timestamp: Date.now(),
        };

        return response.data;
    } catch (err) {
        console.error(`Error: ${err.message}`);
        return null;
    } finally {
        cleanCache();
    }
};

// Fungsi untuk format harga
const formatPrice = (price) => {
    return price ? `$${price.toFixed(2)}` : 'N/A';
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
    console.clear(); // Bersihkan terminal untuk tampilan yang rapi
    console.log(`Harga Crypto Blue-Chip (Terakhir diperbarui: ${formatTimestamp(timestamp)})`);
    console.table(
        coins.map((coin) => ({
            Koin: coin.charAt(0).toUpperCase() + coin.slice(1),
            Harga: formatPrice(prices[coin]?.usd),
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