import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

export class TwilioService {
  private _client: twilio.Twilio | null = null;

  private get client(): twilio.Twilio {
    if (!this._client) {
      if (!accountSid || !authToken || accountSid.includes('your_')) {
        throw new Error('Twilio credentials not configured. Please check your .env.local file.');
      }
      this._client = twilio(accountSid, authToken);
    }
    return this._client;
  }

  /**
   * Generates an Access Token for the frontend dialer
   */
  generateToken(identity: string) {
    if (!apiKey || !apiSecret || !twimlAppSid) {
      throw new Error('Twilio API credentials or App SID not found');
    }

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const token = new AccessToken(accountSid!, apiKey, apiSecret, { identity });
    
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    });

    token.addGrant(voiceGrant);
    return token.toJwt();
  }

  /**
   * Initiates an automated call with recording enabled
   */
  async makeCall(to: string, from: string, url: string) {
    try {
      const call = await this.client.calls.create({
        url,
        to,
        from,
        record: true, // Enable recording
        recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/status`,
      });
      return call;
    } catch (error) {
      console.error('Error making Twilio call:', error);
      throw error;
    }
  }

  /**
   * Generates TwiML for an outgoing call that should be recorded
   */
  generateDialTwiML(to: string) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    const dial = response.dial({
      record: 'record-from-answer',
      recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/status`,
    });
    dial.number(to);
    return response.toString();
  }

  /**
   * Generates TwiML to connect an answered call to a specific agent (client)
   */
  generateAgentConnectTwiML(agentIdentity: string) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    const dial = response.dial({
      record: 'record-from-answer',
      recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/status`,
    });
    dial.client(agentIdentity);
    return response.toString();
  }
}

export const twilioService = new TwilioService();
