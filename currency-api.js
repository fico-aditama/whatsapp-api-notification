import axios from 'axios';

const getUsdToIdrRate = async () => {
  try {
    const response = await axios.get('https://open.er-api.com/v6/latest/USD');
    const rate = response.data.rates.IDR;
    console.log(`1 USD = ${rate} IDR`);
    return rate;
  } catch (error) {
    console.error('Gagal mengambil data kurs:', error);
    return null;
  }
};

getUsdToIdrRate();
