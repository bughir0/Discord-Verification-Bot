import logger from './logger.js';

/**
 * Agenda a deleção de uma mensagem após 1 minuto
 * @param {Message} message - Mensagem a ser deletada
 * @param {number} delay - Delay em milissegundos (padrão: 60000 = 1 minuto)
 */
export function scheduleAutoDelete(message, delay = 60000) {
    if (!message || !message.delete) {
        logger.warning('Tentativa de agendar deleção de mensagem inválida', {
            messageId: message?.id,
            hasDelete: !!message?.delete
        });
        return;
    }

    setTimeout(async () => {
        try {
            await message.delete();
        } catch (error) {
            // Ignorar erros se a mensagem já foi deletada ou não existe mais
            if (error.code !== 10008) { // Unknown Message
                logger.warning('Erro ao deletar mensagem automaticamente', {
                    messageId: message.id,
                    channelId: message.channel?.id,
                    error: error.message,
                    code: error.code
                });
            }
        }
    }, delay);
}

/**
 * Envia uma mensagem e agenda sua deleção após 1 minuto
 * @param {TextChannel|DMChannel|NewsChannel|ThreadChannel} channel - Canal onde enviar
 * @param {Object} options - Opções da mensagem (embeds, content, etc)
 * @param {number} delay - Delay em milissegundos (padrão: 60000 = 1 minuto)
 * @returns {Promise<Message>} Mensagem enviada
 */
export async function sendAutoDeleteMessage(channel, options, delay = 60000) {
    try {
        const message = await channel.send(options);
        scheduleAutoDelete(message, delay);
        return message;
    } catch (error) {
        logger.error('Erro ao enviar mensagem com auto-delete', {
            channelId: channel.id,
            error: error.message,
            code: error.code
        });
        throw error;
    }
}

/**
 * Responde a uma interação e agenda a deleção da mensagem após 1 minuto
 * @param {CommandInteraction|ButtonInteraction|SelectMenuInteraction} interaction - Interação
 * @param {Object} options - Opções da resposta
 * @param {number} delay - Delay em milissegundos (padrão: 60000 = 1 minuto)
 * @returns {Promise<Message>} Mensagem enviada
 */
export async function replyWithAutoDelete(interaction, options, delay = 60000) {
    try {
        let message;
        
        if (interaction.replied || interaction.deferred) {
            message = await interaction.editReply(options);
        } else {
            message = await interaction.reply({
                ...options,
                fetchReply: true
            });
        }

        // Só agendar deleção se não for ephemeral
        if (!options.ephemeral && !(options.flags === 64)) {
            scheduleAutoDelete(message, delay);
        }

        return message;
    } catch (error) {
        logger.error('Erro ao responder interação com auto-delete', {
            interactionId: interaction.id,
            error: error.message,
            code: error.code
        });
        throw error;
    }
}

/**
 * Atualiza uma mensagem de interação e agenda sua deleção após 1 minuto
 * @param {ButtonInteraction|SelectMenuInteraction} interaction - Interação
 * @param {Object} options - Opções da atualização
 * @param {number} delay - Delay em milissegundos (padrão: 60000 = 1 minuto)
 * @returns {Promise<Message>} Mensagem atualizada
 */
export async function updateWithAutoDelete(interaction, options, delay = 60000) {
    try {
        let message;
        
        // Se a interação já foi respondida ou deferida, usar editReply
        if (interaction.replied || interaction.deferred) {
            message = await interaction.editReply({
                ...options,
                fetchReply: true
            });
        } else {
            // Caso contrário, usar update normalmente
            message = await interaction.update({
                ...options,
                fetchReply: true
            });
        }

        // Só agendar deleção se não for ephemeral
        if (!options.ephemeral && !(options.flags === 64)) {
            scheduleAutoDelete(message, delay);
        }

        return message;
    } catch (error) {
        logger.error('Erro ao atualizar interação com auto-delete', {
            interactionId: interaction.id,
            error: error.message,
            code: error.code
        });
        throw error;
    }
}

