export class Recorder {
  mediaRecorder: MediaRecorder | null = null;
  recordedChunks: Blob[] = [];
  audioContext: AudioContext | null = null;
  audioSource: AudioBufferSourceNode | null = null;
  destination: MediaStreamAudioDestinationNode | null = null;
  stream: MediaStream | null = null;

  async start(canvas: HTMLCanvasElement, audioFile: File | null) {
    this.recordedChunks = [];
    const videoStream = (canvas as any).captureStream(60);
    
    if (audioFile) {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this.destination = this.audioContext.createMediaStreamDestination();
      this.audioSource = this.audioContext.createBufferSource();
      this.audioSource.buffer = audioBuffer;
      this.audioSource.loop = true;
      
      this.audioSource.connect(this.destination);
      this.audioSource.connect(this.audioContext.destination);

      this.stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...this.destination.stream.getAudioTracks()
      ]);
      
      this.audioSource.start();
    } else {
      this.stream = videoStream;
    }

    // Determine best supported mime type
    let options: MediaRecorderOptions = {};
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        options.mimeType = type;
        break;
      }
    }

    // Set bitrates for better quality
    options.videoBitsPerSecond = 5000000; // 5 Mbps

    try {
      this.mediaRecorder = new MediaRecorder(this.stream!, options);
    } catch (e) {
      console.error('Recorder initialization failed', e);
      // Fallback to default
      this.mediaRecorder = new MediaRecorder(this.stream!);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(1000);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        return resolve(blob);
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        resolve(blob);
      };

      this.mediaRecorder.stop();
      if (this.audioSource) {
        try {
          this.audioSource.stop();
        } catch (e) {}
        this.audioSource.disconnect();
        this.audioSource = null;
      }
      if (this.audioContext) {
        // Don't close, just suspend if needed, or leave open for reuse
        // this.audioContext.suspend();
      }
    });
  }
}
