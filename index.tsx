
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { UltravoxSession } from 'https://esm.sh/ultravox-client@0.3.6';

// --- DOM Elements ---
const callStatusEl = document.getElementById('callStatus');
const bookingDetailsEl = document.getElementById('bookingDetails');
const bookingTotalEl = document.getElementById('bookingTotal');
const startCallBtn = document.getElementById('startCall');
const endCallBtn = document.getElementById('endCall');
const chatBubbleBtn = document.getElementById('chat-bubble-button');
const chatPanelContainer = document.getElementById('chat-panel-container');
const closeChatPanelBtn = document.getElementById('close-chat-panel');
const systemPromptEl = document.getElementById('systemPrompt') as HTMLTextAreaElement;


// WARNING: Storing API keys in client-side code is insecure.
// In a production environment, this should be handled via a secure backend proxy.
const API_KEY = 'oRfuQ0YG.JX8cMYNQiHdXGsmP8dVFHGLOtUbSREEL';
const VOICE_ID = '50696f55-794c-443f-b4a1-8be8bde94e8d'; // "Maxpotencia"

const uvSession = new UltravoxSession();

// --- Chat Panel UI Logic ---
function openChatPanel() {
    chatPanelContainer?.classList.add('is-open');
}
function closeChatPanel() {
    chatPanelContainer?.classList.remove('is-open');
}

// --- Booking Logic ---
let booking: { id: string, name: string, price: number, nights: number } | null = null;

function updateBookingUI() {
    if (!bookingDetailsEl || !bookingTotalEl) return;

    if (!booking) {
        bookingDetailsEl.innerHTML = '<p class="text-gray-500">Aún no ha seleccionado una habitación.</p>';
        bookingTotalEl.textContent = '$0.00';
        return;
    }

    bookingDetailsEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <p class="font-semibold text-blue-800">${booking.name}</p>
                <p class="text-sm text-gray-600">${booking.nights} noche(s)</p>
            </div>
            <p class="font-semibold text-lg">$${(booking.price * booking.nights).toFixed(2)}</p>
        </div>
    `;

    const total = booking.price * booking.nights;
    bookingTotalEl.textContent = `$${total.toFixed(2)}`;
}

// Custom event to decouple the tool from the UI update logic.
window.addEventListener('updateBooking', (event: CustomEvent) => {
    const { roomId, roomName, price } = event.detail;
    // For simplicity, we replace the current booking instead of adding multiple rooms.
    booking = { id: roomId, name: roomName, price: price, nights: 1 };
    updateBookingUI();
});


// --- Ultravox Call Logic ---
function updateStatus(message: string, type: 'info' | 'success' | 'warning' | 'error' | 'neutral' = 'info') {
    if (!callStatusEl) return;
    const colorClasses = {
        info: 'text-blue-600',
        success: 'text-green-600',
        warning: 'text-yellow-600',
        error: 'text-red-600',
        neutral: 'text-gray-600'
    };
    callStatusEl.innerHTML = `<span class="${colorClasses[type]}">${message}</span>`;
}

async function createDirectCall(apiKey: string, systemPrompt: string, voiceId: string) {
    try {
        updateStatus('Iniciando asistente...', 'info');
        const payload = {
            systemPrompt: systemPrompt,
            voice: voiceId,
            temperature: 0.4
        };
        
        const response = await fetch(`https://api.ultravox.ai/api/calls`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Unsafe-API-Key': apiKey
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        const callData = await response.json();
        return callData.joinUrl;
    } catch (error) {
        console.error('Error creando la llamada directa:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        throw error;
    }
}

// --- Client Tool Implementation ---
// The 'updateBookingDetails' tool dispatches a custom event to update the UI.
uvSession.registerToolImplementation('updateBookingDetails', (params) => {
    console.log('Herramienta del cliente \`updateBookingDetails\` llamada con:', params);
    const { roomId, roomName, price } = params;

    if (roomId && roomName && typeof price === 'number') {
        const event = new CustomEvent("updateBooking", {
            detail: { roomId, roomName, price },
        });
        window.dispatchEvent(event);
        
        const message = `Se seleccionó '${roomName}'.`;
        return JSON.stringify({ success: true, message: message });
    } else {
        const errorMessage = 'Parámetros inválidos recibidos para updateBookingDetails.';
        console.error(errorMessage, params);
        return JSON.stringify({ success: false, message: errorMessage });
    }
});

// --- Ultravox Session Status Listener ---
uvSession.addEventListener('status', () => {
    const statusMap = {
        'connecting': { message: 'Conectando...', type: 'info' },
        'connected': { message: 'Conectado. ¡Hola!', type: 'success' },
        'disconnecting': { message: 'Desconectando...', type: 'warning' },
        'disconnected': { message: 'Desconectado', type: 'neutral' }
    };
    const statusInfo = statusMap[uvSession.status] || { message: `Estado: ${uvSession.status}`, type: 'info' };
    updateStatus(statusInfo.message, statusInfo.type as any);

    if (uvSession.status === 'disconnected') {
        booking = null;
        updateBookingUI();
        console.log('La reserva se ha borrado al finalizar la llamada.');
        closeChatPanel();
    }
});

// --- Event Handlers ---
if (chatBubbleBtn) {
    chatBubbleBtn.onclick = () => openChatPanel();
}
if(closeChatPanelBtn) {
    closeChatPanelBtn.onclick = () => closeChatPanel();
}

if (startCallBtn) {
    startCallBtn.onclick = async function() {
        try {
            if (!systemPromptEl?.value) {
                updateStatus('El System Prompt no puede estar vacío.', 'error');
                return;
            }
            const systemPrompt = systemPromptEl.value;

            const joinUrl = await createDirectCall(API_KEY, systemPrompt, VOICE_ID);
            if (!joinUrl) return;
            
            updateStatus('Conectando a la llamada...', 'info');
            
            await uvSession.joinCall(joinUrl);
        } catch (error) {
            updateStatus(`Fallo al iniciar: ${error.message}`, 'error');
        }
    };
}

if (endCallBtn) {
    endCallBtn.onclick = async function() {
        updateStatus('Finalizando...', 'warning');
        await uvSession.leaveCall();
        closeChatPanel();
    };
}

// Initial UI render
updateBookingUI();
