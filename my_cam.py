import cv2


def capture_frame(source=0):
    cap = cv2.VideoCapture(source)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        raise RuntimeError('Unable to capture frame')
    return frame


if __name__ == '__main__':
    frame = capture_frame()
    print('Captured frame shape:', frame.shape)
