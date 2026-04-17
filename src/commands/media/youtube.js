import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import ytdl from '@distube/ytdl-core';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { success, error, warning } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';
import { replyWithAutoDelete } from '../../utils/autoDeleteMessage.js';

const ffmpegPath = ffmpegInstaller.path;

/**
 * Converte um arquivo de vídeo para MP3 usando o binário ffmpeg (sem fluent-ffmpeg).
 * @param {string} inputPath - Caminho do vídeo de entrada
 * @param {string} outputPath - Caminho do MP3 de saída
 * @returns {Promise<void>}
 */
function convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', inputPath,
            '-vn',
            '-acodec', 'libmp3lame',
            '-ab', '128k',
            '-y',
            outputPath
        ];
        const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.on('close', (code) => {
            if (code === 0) return resolve();
            reject(new Error(stderr || `FFmpeg saiu com código ${code}`));
        });
        proc.on('error', reject);
    });
}

// Suprimir avisos do ytdl-core sobre player-script.js
const originalWarn = console.warn;
console.warn = function(...args) {
    const message = args.join(' ');
    if (message.includes('player-script.js') ||
        message.includes('Could not parse decipher function') ||
        message.includes('Could not parse n transform function')) {
        return;
    }
    originalWarn.apply(console, args);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, '../../temp');
const rootDir = path.join(__dirname, '../..');

// Garantir que a pasta temp existe
async function ensureTempDir() {
    try {
        await fs.access(tempDir);
    } catch {
        await fs.mkdir(tempDir, { recursive: true });
    }
}

// Limpar arquivo temporário
async function cleanupFile(filePath) {
    try {
        await fs.unlink(filePath);
    } catch (err) {
        logger.warning('Erro ao deletar arquivo temporário', {
            filePath,
            error: err.message
        });
    }
}

// Limpar arquivos player-script.js criados pelo ytdl-core
async function cleanupPlayerScripts() {
    try {
        // Tentar múltiplos caminhos possíveis
        const possibleDirs = [
            rootDir, // Diretório raiz do projeto
            process.cwd(), // Diretório de trabalho atual
            path.dirname(process.cwd()) // Diretório pai
        ];
        
        let totalDeleted = 0;
        
        for (const dir of possibleDirs) {
            try {
                const files = await fs.readdir(dir);
                const playerScripts = files.filter(file => 
                    file.endsWith('-player-script.js')
                );
                
                for (const file of playerScripts) {
                    const filePath = path.join(dir, file);
                    try {
                        const stats = await fs.stat(filePath);
                        if (stats.isFile()) {
                            await fs.unlink(filePath);
                            totalDeleted++;
                            logger.debug('Arquivo player-script.js deletado', { 
                                file,
                                path: filePath
                            });
                        }
                    } catch (err) {
                        // Ignorar se arquivo não existe ou está em uso
                        if (err.code !== 'ENOENT' && err.code !== 'EBUSY') {
                            logger.debug('Erro ao deletar arquivo player-script.js', {
                                file,
                                path: filePath,
                                error: err.message,
                                code: err.code
                            });
                        }
                    }
                }
            } catch (dirErr) {
                // Ignorar se diretório não existe
                if (dirErr.code !== 'ENOENT') {
                    logger.debug('Erro ao ler diretório para limpeza', {
                        dir,
                        error: dirErr.message
                    });
                }
            }
        }
        
        if (totalDeleted > 0) {
            logger.debug(`Limpeza de player-script.js: ${totalDeleted} arquivo(s) removido(s)`);
        }
    } catch (err) {
        logger.debug('Erro ao limpar arquivos player-script.js', {
            error: err.message
        });
    }
}

// Limpeza periódica em background (a cada 10 segundos durante o comando)
let cleanupInterval = null;
function startPeriodicCleanup() {
    if (cleanupInterval) return; // Já está rodando
    
    cleanupInterval = setInterval(async () => {
        await cleanupPlayerScripts();
    }, 10000); // A cada 10 segundos
}

function stopPeriodicCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}

export const data = new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('📥 Baixa vídeos do YouTube e converte para MP3 ou envia em MP4')
    .addStringOption(option =>
        option.setName('url')
            .setDescription('URL do vídeo do YouTube')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('formato')
            .setDescription('Formato desejado (MP3 ou MP4)')
            .setRequired(true)
            .addChoices(
                { name: 'MP3 (Áudio)', value: 'mp3' },
                { name: 'MP4 (Vídeo)', value: 'mp4' }
            ));

export async function handleYoutubeCommand(interaction) {
    const url = interaction.options.getString('url');
    const formato = interaction.options.getString('formato');

    // Limpar arquivos player-script.js antigos antes de iniciar
    await cleanupPlayerScripts();
    
    // Iniciar limpeza periódica em background
    startPeriodicCleanup();

    try {
        // Validar URL do YouTube
        if (!ytdl.validateURL(url)) {
            return await replyWithAutoDelete(interaction, {
                ...error({
                    title: 'URL Inválida',
                    description: 'Por favor, forneça uma URL válida do YouTube.',
                    ephemeral: true
                })
            });
        }

        // Responder que está processando
        await interaction.deferReply({ ephemeral: true });

        // Garantir que a pasta temp existe
        await ensureTempDir();

        // Obter informações do vídeo com tratamento de erro melhorado
        let videoInfo;
        try {
            videoInfo = await ytdl.getInfo(url, {
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }
            });
        } catch (infoError) {
            logger.error('Erro ao obter informações do vídeo', {
                url,
                error: infoError.message,
                stack: infoError.stack
            });
            
            // Tentar novamente sem opções extras
            try {
                videoInfo = await ytdl.getInfo(url);
            } catch (retryError) {
                await interaction.editReply({
                    embeds: [error({
                        title: 'Erro ao Acessar Vídeo',
                        description: 'Não foi possível acessar o vídeo do YouTube. Isso pode acontecer se:\n\n• O vídeo é privado ou restrito\n• O YouTube bloqueou o acesso temporariamente\n• A URL está incorreta\n\n**Soluções:**\n• Tente novamente em alguns minutos\n• Use outro vídeo\n• Verifique se a URL está correta',
                        ephemeral: true
                    }).embeds[0]]
                });
                return;
            }
        }
        
        const videoTitle = videoInfo.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_'); // Remover caracteres inválidos
        const videoId = videoInfo.videoDetails.videoId;

        logger.info('Iniciando download do YouTube', {
            url,
            videoId,
            title: videoTitle,
            formato,
            userId: interaction.user.id,
            userTag: interaction.user.tag
        });

        // Enviar mensagem de processamento
        const processingEmbed = warning({
            title: '⏳ Processando...',
            description: `Baixando e processando: **${videoTitle}**\n\nIsso pode levar alguns minutos...`,
            ephemeral: true
        });
        
        await interaction.editReply({
            embeds: processingEmbed.embeds
        });

        const timestamp = Date.now();
        let outputPath;
        let fileName;

        if (formato === 'mp3') {
            // Baixar como MP3
            const tempVideoPath = path.join(tempDir, `${videoId}_${timestamp}.mp4`);
            const tempAudioPath = path.join(tempDir, `${videoId}_${timestamp}.mp3`);
            
            // Baixar vídeo primeiro (método mais confiável)
            const videoStream = ytdl(url, {
                quality: 'lowestvideo',
                filter: 'audioandvideo',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }
            });
            
            const writeStream = createWriteStream(tempVideoPath);
            
            await new Promise((resolve, reject) => {
                videoStream.pipe(writeStream);
                videoStream.on('end', resolve);
                videoStream.on('error', (err) => {
                    cleanupFile(tempVideoPath);
                    reject(err);
                });
                writeStream.on('error', (err) => {
                    cleanupFile(tempVideoPath);
                    reject(err);
                });
            });

            // Converter para MP3 (usando ffmpeg via child_process)
            try {
                logger.info('FFmpeg iniciado para conversão MP3', { input: tempVideoPath, output: tempAudioPath });
                await convertToMp3(tempVideoPath, tempAudioPath);
            } catch (err) {
                cleanupFile(tempVideoPath);
                logger.error('Erro na conversão FFmpeg', { error: err.message, stack: err.stack });
                throw err;
            }
            cleanupFile(tempVideoPath);

            outputPath = tempAudioPath;
            fileName = `${videoTitle.substring(0, 50)}.mp3`;
        } else {
            // Baixar como MP4
            const tempVideoPath = path.join(tempDir, `${videoId}_${timestamp}.mp4`);
            
            const videoStream = ytdl(url, {
                quality: 'lowestvideo',
                filter: 'audioandvideo',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }
            });
            
            const writeStream = createWriteStream(tempVideoPath);
            
            await new Promise((resolve, reject) => {
                videoStream.pipe(writeStream);
                videoStream.on('end', resolve);
                videoStream.on('error', (err) => {
                    cleanupFile(tempVideoPath);
                    reject(err);
                });
                writeStream.on('error', (err) => {
                    cleanupFile(tempVideoPath);
                    reject(err);
                });
            });

            outputPath = tempVideoPath;
            fileName = `${videoTitle.substring(0, 50)}.mp4`;
        }

        // Verificar tamanho do arquivo (Discord limita a 25MB)
        const stats = await fs.stat(outputPath);
        const fileSizeMB = stats.size / (1024 * 1024);

        if (fileSizeMB > 25) {
            await cleanupFile(outputPath);
            return await interaction.editReply({
                ...error({
                    title: 'Arquivo Muito Grande',
                    description: `O arquivo é muito grande (${fileSizeMB.toFixed(2)}MB). O Discord limita arquivos a 25MB.\n\nTente um vídeo mais curto ou use MP3.`,
                    ephemeral: true
                }).embeds
            });
        }

        // Criar attachment
        const attachment = new AttachmentBuilder(outputPath, { name: fileName });

        // Enviar arquivo
        const successEmbed = success({
            title: 'Download Concluído',
            description: `**${videoTitle}**\n\nFormato: ${formato.toUpperCase()}\nTamanho: ${fileSizeMB.toFixed(2)}MB`,
            ephemeral: true
        });
        
        await interaction.editReply({
            embeds: successEmbed.embeds,
            files: [attachment]
        });

        // Limpar arquivo após 5 segundos (dar tempo para o Discord baixar)
        setTimeout(() => {
            cleanupFile(outputPath);
        }, 5000);

        // Limpar arquivos player-script.js imediatamente e também após delay
        await cleanupPlayerScripts();
        setTimeout(() => {
            cleanupPlayerScripts();
            stopPeriodicCleanup(); // Parar limpeza periódica
        }, 5000);

        logger.info('Download do YouTube concluído', {
            url,
            videoId,
            title: videoTitle,
            formato,
            fileSizeMB: fileSizeMB.toFixed(2),
            userId: interaction.user.id,
            userTag: interaction.user.tag
        });

    } catch (err) {
        // Limpar arquivos player-script.js mesmo em caso de erro
        await cleanupPlayerScripts();
        setTimeout(() => {
            cleanupPlayerScripts();
            stopPeriodicCleanup(); // Parar limpeza periódica
        }, 5000);

        logger.error('Erro ao processar download do YouTube', {
            url,
            formato,
            error: err.message,
            stack: err.stack,
            userId: interaction.user.id,
            userTag: interaction.user.tag
        });

        // Tentar responder com erro
        try {
            const errorMessage = err.message || 'Erro desconhecido';
            let errorDescription = `Ocorreu um erro ao processar o vídeo.\n\n`;
            
            // Mensagens de erro mais amigáveis
            if (errorMessage.includes('Could not extract functions') || errorMessage.includes('extract functions')) {
                errorDescription += '**Erro:** YouTube bloqueou o acesso ao vídeo.\n\n';
                errorDescription += '**Soluções:**\n';
                errorDescription += '• Tente novamente em alguns minutos\n';
                errorDescription += '• Use outro vídeo\n';
                errorDescription += '• O vídeo pode estar restrito ou privado';
            } else if (errorMessage.includes('Video unavailable')) {
                errorDescription += '**Erro:** Vídeo indisponível.\n\n';
                errorDescription += 'O vídeo pode estar privado, restrito por região ou foi removido.';
            } else {
                errorDescription += `**Erro:** ${errorMessage}\n\n`;
                errorDescription += 'Verifique se a URL é válida e tente novamente.';
            }
            
            const errorEmbed = error({
                title: 'Erro ao Processar',
                description: errorDescription,
                ephemeral: true
            });
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    embeds: errorEmbed.embeds
                });
            } else {
                await replyWithAutoDelete(interaction, {
                    ...errorEmbed
                });
            }
        } catch (replyError) {
            logger.error('Erro ao enviar mensagem de erro', {
                error: replyError.message,
                originalError: err.message
            });
            
            // Última tentativa - enviar mensagem simples
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content: '❌ Ocorreu um erro ao processar o vídeo. Tente novamente mais tarde.',
                        embeds: []
                    });
                }
            } catch (finalError) {
                logger.error('Erro ao enviar mensagem de erro final', {
                    error: finalError.message
                });
            }
        }
    }
}

