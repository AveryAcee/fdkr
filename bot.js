const os = require('os');
const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');

// Cek dan update Node.js & npm jika dijalankan di Linux
function updateNodeAndNpm() {
    if (os.platform() === 'linux') {
        try {
            console.log('🔧 Deteksi Linux - memperbarui Node.js dan npm...');
            execSync('which curl || sudo apt update && sudo apt install curl -y', { stdio: 'inherit' });
            execSync('curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -', { stdio: 'inherit' });
            execSync('sudo apt-get install -y nodejs', { stdio: 'inherit' });
            execSync('sudo npm install -g npm', { stdio: 'inherit' });
            console.log('✅ Node.js dan npm berhasil diperbarui.');
        } catch (error) {
            console.error('❌ Gagal memperbarui Node.js/npm:', error.message);
        }
    } else {
        console.log('⚠️ Bukan sistem Linux, melewati proses update Node.js/npm.');
    }
}

updateNodeAndNpm();

// Cek dan install dependensi jika belum terinstal
function installDependencies() {
    try {
        require.resolve('node-telegram-bot-api');
        require.resolve('ethers');
        require.resolve('dotenv');
    } catch (e) {
        console.log('📦 Menginstal dependensi...');
        execSync('npm install node-telegram-bot-api ethers dotenv', { stdio: 'inherit' });
    }
}

installDependencies();
require('dotenv').config();

// Cek apakah dotenv membaca .env dengan benar
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.ALCHEMY_API_KEY) {
    console.log('Gagal membaca konfigurasi dari .env, akan meminta ulang...');
}

const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');

// Fungsi untuk meminta input API dari pengguna dan menyimpannya ke .env
async function setupEnv() {
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.ALCHEMY_API_KEY) {
        return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    function ask(question) {
        return new Promise(resolve => rl.question(question, resolve));
    }

    const telegramToken = await ask('Masukkan Telegram Bot API Token: ');
    const alchemyKey = await ask('Masukkan Alchemy API Key: ');

    rl.close();

    const envData = `TELEGRAM_BOT_TOKEN=${telegramToken}\nALCHEMY_API_KEY=${alchemyKey}\n`;
    fs.writeFileSync('.env', envData);
    console.log('Konfigurasi tersimpan di .env');
    process.env.TELEGRAM_BOT_TOKEN = telegramToken;
    process.env.ALCHEMY_API_KEY = alchemyKey;
}

(async () => {
    await setupEnv();
    console.log('Loaded Telegram Token:', process.env.TELEGRAM_BOT_TOKEN);

    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

    const rpcUrls = {
        b2rn: 'https://b2n.rpc.caldera.xyz/http',
        arbitrum: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        base: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        optimism: `https://opt-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        unichain: `https://unichain-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        blast: `https://blast-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    };

    const userTracking = {};

    async function fetchBalance(network, address) {
        try {
            const provider = new ethers.JsonRpcProvider(rpcUrls[network]);
            const balance = await provider.getBalance(address);
            return parseFloat(ethers.formatEther(balance)).toFixed(4);
        } catch (error) {
            console.error(`Error fetching balance for ${network}:`, error.message);
            return 'Error';
        }
    }

    async function sendBalanceUpdate(chatId, address) {
        if (!userTracking[chatId]) return;

        const balances = await Promise.all(
            Object.keys(rpcUrls).map(async (network) => {
                const balance = await fetchBalance(network, address);
                return `• <b>${network.toUpperCase()}</b>: <code>${balance} ETH</code>`;
            })
        );

        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        const message = `<b>💰 Balance for address:</b>\n<code>${address}</code>\n\n${balances.join('\n')}\n\n⏰ <i>Last update:</i> ${now}`;

        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });

        setTimeout(() => sendBalanceUpdate(chatId, address), 10 * 60 * 1000);
    }

    bot.onText(/\/check (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const address = match[1].trim();

        if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
            return bot.sendMessage(chatId, '⚠️ Alamat Ethereum tidak valid!');
        }

        bot.sendMessage(chatId, '🔍 Mengecek saldo, mohon tunggu...');
        userTracking[chatId] = address;
        sendBalanceUpdate(chatId, address);
    });

    bot.onText(/\/stop/, (msg) => {
        const chatId = msg.chat.id;
        delete userTracking[chatId];
        bot.sendMessage(chatId, '🛑 Update otomatis dihentikan.');
    });

    console.log('🤖 Bot is running...');
})();
