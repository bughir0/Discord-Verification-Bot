import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { sendLogWithFallback } from '../utils/logUtils.js';
import { getColors, getChannelId } from '../utils/configHelper.js';
import logger from '../utils/logger.js';
import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

// Cache para mensagens editadas (armazenar por 5 minutos)
const messageCache = new Map();

/**
 * Limpa o cache de mensagens antigas
 */
function cleanMessageCache() {
    const now = Date.now();
    for (const [key, data] of messageCache.entries()) {
        if (now - data.timestamp > 5 * 60 * 1000) { // 5 minutos
            messageCache.delete(key);
        }
    }
}

// Limpar cache a cada minuto
setInterval(cleanMessageCache, 60 * 1000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, '../temp');

// Garantir que a pasta temp existe
async function ensureTempDir() {
    try {
        await fs.access(tempDir);
    } catch {
        await fs.mkdir(tempDir, { recursive: true });
    }
}

/**
 * Baixa uma imagem de uma URL e retorna o caminho do arquivo
 * @param {string} url - URL da imagem
 * @param {string} filename - Nome do arquivo
 * @returns {Promise<string|null>} Caminho do arquivo ou null se falhar
 */
async function downloadImage(url, filename) {
    try {
        await ensureTempDir();
        const filePath = path.join(tempDir, filename);
        
        return new Promise((resolve) => {
            const protocol = url.startsWith('https') ? https : http;
            const file = createWriteStream(filePath);
            
            // Timeout de 10 segundos
            const timeout = setTimeout(() => {
                request?.destroy();
                file.close();
                fs.unlink(filePath).catch(() => {});
                resolve(null);
            }, 10000);
            
            const request = protocol.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }, (response) => {
                clearTimeout(timeout);
                
                // Verificar se é uma resposta válida
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(filePath).catch(() => {});
                    resolve(null);
                    return;
                }
                
                // Verificar se é uma imagem (mas aceitar mesmo sem content-type se a URL parece ser de imagem)
                const contentType = response.headers['content-type'];
                const isImageUrl = url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i);
                
                if (contentType && !contentType.startsWith('image/') && !isImageUrl) {
                    file.close();
                    fs.unlink(filePath).catch(() => {});
                    resolve(null);
                    return;
                }
                
                // Limitar tamanho do arquivo (25MB máximo do Discord)
                let downloadedBytes = 0;
                const maxSize = 25 * 1024 * 1024; // 25MB
                
                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (downloadedBytes > maxSize) {
                        request.destroy();
                        file.close();
                        fs.unlink(filePath).catch(() => {});
                        resolve(null);
                    }
                });
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    clearTimeout(timeout);
                    resolve(filePath);
                });
                
                file.on('error', (err) => {
                    clearTimeout(timeout);
                    file.close();
                    fs.unlink(filePath).catch(() => {});
                    resolve(null);
                });
            });
            
            request.on('error', (err) => {
                clearTimeout(timeout);
                file.close();
                fs.unlink(filePath).catch(() => {});
                resolve(null);
            });
        });
    } catch (error) {
        logger.warning('Erro ao baixar imagem', {
            error: error.message,
            url
        });
        return null;
    }
}

/**
 * Limpa arquivos temporários de imagens
 * @param {string} filePath - Caminho do arquivo
 */
async function cleanupImage(filePath) {
    try {
        await fs.unlink(filePath);
    } catch (err) {
        // Ignorar se arquivo não existe
        if (err.code !== 'ENOENT') {
            logger.debug('Erro ao deletar imagem temporária', {
                error: err.message,
                filePath
            });
        }
    }
}

export async function handleMessageDelete(message) {
    try {
        if (!message.guild || message.author.bot) return;

        const colors = getColors();
        const embed = new EmbedBuilder()
            .setColor(colors.danger)
            .setAuthor({
                name: 'Mensagem Deletada',
                iconURL: message.guild.iconURL({ dynamic: true }) || undefined
            })
            .setTitle('🗑️ Mensagem Removida')
            .setDescription(`Uma mensagem foi deletada em ${message.channel}`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                {
                    name: '👤 Autor',
                    value: `${message.author} (\`${message.author.tag}\`)`,
                    inline: true
                },
                {
                    name: '📝 Canal',
                    value: `${message.channel} (\`${message.channel.name}\`)`,
                    inline: true
                },
                {
                    name: '🕐 Deletada em',
                    value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                    inline: true
                }
            )
            .setFooter({ text: `ID: ${message.id}` })
            .setTimestamp();

        // Adicionar conteúdo da mensagem se existir
        if (message.content) {
            const content = message.content.length > 1024 
                ? message.content.substring(0, 1021) + '...' 
                : message.content;
            embed.addFields({
                name: '💬 Conteúdo',
                value: content || '*Sem conteúdo de texto*',
                inline: false
            });
        }

        // Processar anexos (imagens) - baixar imediatamente antes que expirem
        const imageAttachments = [];
        const otherAttachments = [];
        
        if (message.attachments.size > 0) {
            // Processar todas as imagens em paralelo para ser mais rápido
            const imagePromises = [];
            const attachmentList = Array.from(message.attachments.values());
            
            for (const attachment of attachmentList) {
                // Verificar se é uma imagem
                const isImage = attachment.contentType && attachment.contentType.startsWith('image/');
                
                if (isImage) {
                    // Tentar baixar a imagem imediatamente
                    const downloadPromise = (async () => {
                        try {
                            const fileExtension = attachment.name?.split('.').pop() || attachment.url.split('.').pop()?.split('?')[0] || 'png';
                            const filename = `deleted_${message.id}_${attachment.id}_${Date.now()}.${fileExtension}`;
                            const downloadedPath = await downloadImage(attachment.url, filename);
                            
                            if (downloadedPath) {
                                // Verificar tamanho do arquivo (Discord limita a 25MB)
                                const stats = await fs.stat(downloadedPath);
                                const fileSizeMB = stats.size / (1024 * 1024);
                                
                                if (fileSizeMB <= 25) {
                                    const attachmentFile = new AttachmentBuilder(downloadedPath, {
                                        name: attachment.name || `image.${fileExtension}`
                                    });
                                    imageAttachments.push(attachmentFile);
                                    
                                    // Limpar arquivo após 60 segundos (dar tempo para o Discord processar)
                                    setTimeout(() => cleanupImage(downloadedPath), 60000);
                                    return true;
                                } else {
                                    // Arquivo muito grande, apenas adicionar link
                                    otherAttachments.push(`[${attachment.name}](${attachment.url})`);
                                    await cleanupImage(downloadedPath);
                                    return false;
                                }
                            } else {
                                // Falhou ao baixar, adicionar como link
                                otherAttachments.push(`[${attachment.name}](${attachment.url})`);
                                return false;
                            }
                        } catch (downloadError) {
                            logger.warning('Erro ao processar imagem deletada', {
                                error: downloadError.message,
                                attachmentId: attachment.id,
                                url: attachment.url
                            });
                            // Em caso de erro, adicionar como link
                            otherAttachments.push(`[${attachment.name}](${attachment.url})`);
                            return false;
                        }
                    })();
                    
                    imagePromises.push(downloadPromise);
                } else {
                    // Não é imagem, apenas adicionar link
                    otherAttachments.push(`[${attachment.name}](${attachment.url})`);
                }
            }
            
            // Aguardar todos os downloads de imagens terminarem
            await Promise.all(imagePromises);
            
            // Adicionar informações sobre anexos no embed
            if (otherAttachments.length > 0) {
                const attachmentsText = otherAttachments.join('\n');
                embed.addFields({
                    name: '📎 Anexos',
                    value: attachmentsText.length > 1024 ? attachmentsText.substring(0, 1021) + '...' : attachmentsText,
                    inline: false
                });
            }
            
            if (imageAttachments.length > 0) {
                embed.addFields({
                    name: '🖼️ Imagens',
                    value: `${imageAttachments.length} imagem(ns) anexada(s) abaixo`,
                    inline: false
                });
            }
        }

        // Adicionar embed se existir
        if (message.embeds.length > 0) {
            embed.addFields({
                name: '📋 Embeds',
                value: `${message.embeds.length} embed(s) na mensagem`,
                inline: false
            });
        }

        // Enviar log com imagens anexadas se houver
        await sendLogWithFallback(message.guild, ['logMessage', 'log', 'modLogs'], {
            embed: embed,
            files: imageAttachments.length > 0 ? imageAttachments : undefined
        });

        logger.info('Log de mensagem deletada enviado', {
            guildId: message.guild.id,
            channelId: message.channel.id,
            messageId: message.id,
            authorId: message.author.id
        });
    } catch (error) {
        logger.error('Erro ao processar mensagem deletada', {
            error: error.message,
            guildId: message.guild?.id,
            messageId: message.id
        });
    }
}

export async function handleMessageUpdate(oldMessage, newMessage) {
    try {
        if (!newMessage.guild || newMessage.author.bot) return;
        if (oldMessage.content === newMessage.content) return; // Sem mudanças

        // Armazenar mensagem antiga no cache
        const cacheKey = `${newMessage.guild.id}_${newMessage.id}`;
        if (!messageCache.has(cacheKey)) {
            messageCache.set(cacheKey, {
                content: oldMessage.content || '*Sem conteúdo*',
                timestamp: Date.now()
            });
        }

        const colors = getColors();
        const cachedContent = messageCache.get(cacheKey)?.content || oldMessage.content || '*Sem conteúdo*';
        
        const embed = new EmbedBuilder()
            .setColor(colors.warning)
            .setAuthor({
                name: 'Mensagem Editada',
                iconURL: newMessage.guild.iconURL({ dynamic: true }) || undefined
            })
            .setTitle('✏️ Mensagem Modificada')
            .setDescription(`Uma mensagem foi editada em ${newMessage.channel}`)
            .addFields(
                {
                    name: '👤 Autor',
                    value: `${newMessage.author} (\`${newMessage.author.tag}\`)`,
                    inline: true
                },
                {
                    name: '📝 Canal',
                    value: `${newMessage.channel} (\`${newMessage.channel.name}\`)`,
                    inline: true
                },
                {
                    name: '🔗 Mensagem',
                    value: `[Ir para mensagem](${newMessage.url})`,
                    inline: true
                },
                {
                    name: '📄 Antes',
                    value: cachedContent.length > 1024 
                        ? cachedContent.substring(0, 1021) + '...' 
                        : cachedContent || '*Sem conteúdo*',
                    inline: false
                },
                {
                    name: '📄 Depois',
                    value: (newMessage.content || '*Sem conteúdo*').length > 1024 
                        ? newMessage.content.substring(0, 1021) + '...' 
                        : newMessage.content || '*Sem conteúdo*',
                    inline: false
                }
            )
            .setFooter({ text: `ID: ${newMessage.id}` })
            .setTimestamp();

        await sendLogWithFallback(newMessage.guild, ['logMessage', 'log', 'modLogs'], {
            embed: embed
        });

        logger.info('Log de mensagem editada enviado', {
            guildId: newMessage.guild.id,
            channelId: newMessage.channel.id,
            messageId: newMessage.id,
            authorId: newMessage.author.id
        });
    } catch (error) {
        logger.error('Erro ao processar mensagem editada', {
            error: error.message,
            guildId: newMessage.guild?.id,
            messageId: newMessage.id
        });
    }
}

export async function handleBulkDelete(messages, channel) {
    try {
        if (!channel.guild) return;

        const colors = getColors();
        const messagesArray = Array.from(messages.values());
        const authors = new Set(messagesArray.map(m => m.author?.id).filter(Boolean));
        
        // Tentar descobrir quem deletou as mensagens usando audit logs
        let deleter = null;
        let deleterAvatar = null;
        try {
            const auditLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: 72 // MESSAGE_BULK_DELETE
            });
            const entry = auditLogs.entries.first();
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                deleter = entry.executor;
                deleterAvatar = deleter.displayAvatarURL({ dynamic: true, size: 256 });
            }
        } catch (error) {
            logger.debug('Erro ao buscar audit log de mensagens em massa deletadas', { error: error.message });
        }
        
        const embed = new EmbedBuilder()
            .setColor(colors.danger)
            .setAuthor({
                name: 'Mensagens em Massa Deletadas',
                iconURL: channel.guild.iconURL({ dynamic: true }) || undefined
            })
            .setTitle('🗑️ Limpeza em Massa')
            .setDescription(`${messages.size} mensagem(ns) foram deletadas em ${channel}`)
            .addFields(
                {
                    name: '📝 Canal',
                    value: `${channel} (\`${channel.name}\`)`,
                    inline: true
                },
                {
                    name: '📊 Quantidade',
                    value: `${messages.size} mensagem(ns)`,
                    inline: true
                },
                {
                    name: '👥 Autores Únicos',
                    value: `${authors.size} autor(es)`,
                    inline: true
                }
            )
            .setFooter({ text: `Canal ID: ${channel.id}` })
            .setTimestamp();

        if (deleter) {
            embed.addFields({
                name: '👤 Deletado por',
                value: `${deleter} (\`${deleter.tag}\`)`,
                inline: true
            });
            embed.setThumbnail(deleterAvatar);
        }

        await sendLogWithFallback(channel.guild, ['logMessage', 'log', 'modLogs'], {
            embed: embed
        });

        logger.info('Log de mensagens em massa deletadas enviado', {
            guildId: channel.guild.id,
            channelId: channel.id,
            count: messages.size,
            uniqueAuthors: authors.size
        });
    } catch (error) {
        logger.error('Erro ao processar mensagens em massa deletadas', {
            error: error.message,
            guildId: channel.guild?.id,
            channelId: channel.id
        });
    }
}

