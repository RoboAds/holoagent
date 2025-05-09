
export default function VideoBox(props: any) {
    return (
        <div className="aspect-video flex rounded-sm overflow-hidden items-center h-[650px] w-[550px] justify-center">
            <video ref={props.video} autoPlay playsInline></video>
            <audio ref={props.audio} autoPlay ></audio>
        </div>
    );
}
